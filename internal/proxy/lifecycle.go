package proxy

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"ffv-web-game/internal/cluster"
	"ffv-web-game/internal/game"
	"ffv-web-game/internal/mapnode"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/servercfg"
)

var mapIDPattern = regexp.MustCompile(`^[a-z][a-z0-9_]{1,31}$`)

// CreateMapRequest is the admin payload for provisioning a new map.
type CreateMapRequest struct {
	ID   string `json:"id"`
	Name string `json:"name"`
	Cols int    `json:"cols"`
	Rows int    `json:"rows"`
}

func (p *Proxy) ClusterMaps() []cluster.MapSpec {
	p.mu.Lock()
	defer p.mu.Unlock()
	out := make([]cluster.MapSpec, len(p.cfg.Maps))
	copy(out, p.cfg.Maps)
	return out
}

func (p *Proxy) mapRunning(id string) bool {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.maps[id] != nil
}

func (p *Proxy) persistCluster() error {
	return cluster.SaveMapsRegistry(p.cfg)
}

func (p *Proxy) startMapLocked(spec cluster.MapSpec) error {
	if p.maps[spec.ID] != nil {
		return nil
	}
	n, err := mapnode.Start(spec, p.profiles, p.accounts)
	if err != nil {
		return err
	}
	n.Forward = func(clientID string, msg []byte) {
		p.sendToClient(clientID, msg)
	}
	n.Transfer = func(req cluster.TransferRequest) {
		p.handleTransfer(req)
	}
	p.maps[spec.ID] = n
	log.Printf("proxy: started map %s (%s)", spec.ID, spec.Name)
	return nil
}

func (p *Proxy) stopMapLocked(id string) {
	n := p.maps[id]
	if n == nil {
		return
	}
	delete(p.maps, id)
	n.Stop()
}

// CreateMap writes blank map + server config, registers in cluster, and starts the node.
func (p *Proxy) CreateMap(req CreateMapRequest) (cluster.MapSpec, error) {
	id := strings.TrimSpace(strings.ToLower(req.ID))
	name := strings.TrimSpace(req.Name)
	if !mapIDPattern.MatchString(id) {
		return cluster.MapSpec{}, fmt.Errorf("invalid map id %q (use lowercase letters, digits, underscore)", id)
	}
	if name == "" {
		name = id
	}
	cols, rows := req.Cols, req.Rows
	if cols <= 0 {
		cols = 80
	}
	if rows <= 0 {
		rows = 60
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	if p.cfg.HasMap(id) {
		return cluster.MapSpec{}, fmt.Errorf("map %q already exists", id)
	}

	cfgPath := filepath.Join("maps", id+".server.json")
	mapPath := game.MapConfigPath(id)

	blank, err := game.NewBlankMapConfig(cols, rows, 32)
	if err != nil {
		return cluster.MapSpec{}, err
	}
	if err := game.SaveMapConfig(mapPath, blank); err != nil {
		return cluster.MapSpec{}, err
	}

	serverDoc := servercfg.Default()
	serverDoc.Server.Name = name
	serverDoc.Server.Addr = ":0"
	serverDoc.Server.Data = p.cfg.Proxy.Data
	serverDoc.Server.Accounts = p.cfg.Proxy.Accounts
	serverDoc.Server.Static = p.cfg.Proxy.Static
	serverDoc.Server.Overworld = filepath.ToSlash(mapPath)
	if def := p.cfg.DefaultMap(); def.Config != "" {
		if base, err := servercfg.Load(def.Config); err == nil {
			serverDoc.Plugins = base.Plugins
			serverDoc.Server.BattleSpeed = base.Server.BattleSpeed
		}
	}
	raw, err := json.MarshalIndent(serverDoc, "", "  ")
	if err != nil {
		_ = os.Remove(mapPath)
		return cluster.MapSpec{}, err
	}
	if err := os.WriteFile(cfgPath, append(raw, '\n'), 0o644); err != nil {
		_ = os.Remove(mapPath)
		return cluster.MapSpec{}, err
	}

	spec := cluster.MapSpec{
		ID:      id,
		Name:    name,
		Config:  filepath.ToSlash(cfgPath),
		Enabled: cluster.BoolPtr(true),
	}
	p.cfg.Maps = append(p.cfg.Maps, spec)
	if err := p.persistCluster(); err != nil {
		p.cfg.RemoveMapSpec(id)
		_ = os.Remove(mapPath)
		_ = os.Remove(cfgPath)
		return cluster.MapSpec{}, fmt.Errorf("register map in cluster: %w", err)
	}
	if err := p.startMapLocked(spec); err != nil {
		p.cfg.RemoveMapSpec(id)
		_ = p.persistCluster()
		_ = os.Remove(mapPath)
		_ = os.Remove(cfgPath)
		return cluster.MapSpec{}, fmt.Errorf("start map server: %w", err)
	}
	log.Printf("proxy: created map %s (%s) %dx%d", id, name, cols, rows)
	return spec, nil
}

// EnableMap marks a map enabled and starts its server if needed.
func (p *Proxy) EnableMap(id string) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	spec, ok := p.cfg.MapByID(id)
	if !ok {
		return fmt.Errorf("map %q not found", id)
	}
	if !p.cfg.UpdateMap(id, func(m *cluster.MapSpec) {
		m.Enabled = cluster.BoolPtr(true)
	}) {
		return fmt.Errorf("map %q not found", id)
	}
	spec.Enabled = cluster.BoolPtr(true)
	if err := p.persistCluster(); err != nil {
		return err
	}
	return p.startMapLocked(spec)
}

// DisableMap evacuates players, stops the map server, and marks it disabled.
func (p *Proxy) DisableMap(id string) error {
	return p.disableOrRemove(id, false)
}

// RemoveMap evacuates players, stops the map server, and removes it from the cluster.
func (p *Proxy) RemoveMap(id string) error {
	return p.disableOrRemove(id, true)
}

func (p *Proxy) disableOrRemove(id string, remove bool) error {
	p.mu.Lock()
	spec, ok := p.cfg.MapByID(id)
	if !ok {
		p.mu.Unlock()
		return fmt.Errorf("map %q not found", id)
	}
	if spec.Default {
		p.mu.Unlock()
		return fmt.Errorf("cannot %s the default map", map[bool]string{false: "disable", true: "remove"}[remove])
	}
	enabledLeft := 0
	for _, m := range p.cfg.Maps {
		if m.ID == id {
			continue
		}
		if m.IsEnabled() {
			enabledLeft++
		}
	}
	if enabledLeft == 0 {
		p.mu.Unlock()
		return fmt.Errorf("cannot %s the last enabled map", map[bool]string{false: "disable", true: "remove"}[remove])
	}
	p.mu.Unlock()

	if err := p.evacuateMap(id); err != nil {
		log.Printf("proxy: evacuate %s: %v", id, err)
	}

	p.mu.Lock()
	defer p.mu.Unlock()
	p.stopMapLocked(id)
	if remove {
		spec, _ = p.cfg.MapByID(id)
		p.cfg.RemoveMapSpec(id)
		if err := p.persistCluster(); err != nil {
			return err
		}
		if spec.Config != "" {
			slash := filepath.ToSlash(spec.Config)
			if strings.HasPrefix(slash, "config/server.") || strings.HasSuffix(slash, ".server.json") {
				_ = os.Remove(spec.Config)
			}
		}
		_ = os.Remove(game.MapConfigPath(id))
		_ = game.DeleteMapOverride(id)
		log.Printf("proxy: removed map %s", id)
		return nil
	}
	if !p.cfg.UpdateMap(id, func(m *cluster.MapSpec) {
		m.Enabled = cluster.BoolPtr(false)
	}) {
		return fmt.Errorf("map %q not found", id)
	}
	if err := p.persistCluster(); err != nil {
		return err
	}
	log.Printf("proxy: disabled map %s", id)
	return nil
}

func (p *Proxy) evacuateMap(mapID string) error {
	p.mu.Lock()
	n := p.maps[mapID]
	sessions := make([]*session, 0)
	if n != nil {
		for _, id := range n.SessionIDs() {
			if s := p.sess[id]; s != nil {
				sessions = append(sessions, s)
			}
		}
	}
	fallback := p.cfg.DefaultMap().ID
	p.mu.Unlock()
	if n == nil {
		return nil
	}

	for _, s := range sessions {
		name := n.CharacterName(s.id)
		destID := fallback
		if name != "" {
			if prof, ok := p.profiles.Get(name); ok {
				if prof.PrevMapID != "" && prof.PrevMapID != mapID && p.cfg.CanTravelTo(prof.PrevMapID) && p.mapRunning(prof.PrevMapID) {
					destID = prof.PrevMapID
				} else if prof.MapID != mapID && p.cfg.CanTravelTo(prof.MapID) && p.mapRunning(prof.MapID) {
					destID = prof.MapID
				}
			}
		}
		if destID == mapID || !p.mapRunning(destID) {
			destID = fallback
		}
		if destID == mapID || !p.mapRunning(destID) {
			p.sendToClient(s.id, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{
				Message: "This zone is closing; reconnect to continue.",
			}))
			n.Detach(s.id)
			s.mapID = ""
			continue
		}
		destX, destY := p.spawnOnMap(destID)
		p.handleTransfer(cluster.TransferRequest{
			ClientID: s.id,
			DestMap:  destID,
			DestX:    destX,
			DestY:    destY,
		})
	}
	return nil
}

func (p *Proxy) spawnOnMap(mapID string) (x, y float64) {
	p.mu.Lock()
	n := p.maps[mapID]
	p.mu.Unlock()
	if n == nil || n.OW == nil {
		return 0, 0
	}
	return n.OW.SpawnPosition("")
}
