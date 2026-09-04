package proxy

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
	"clara-mundi/internal/mapnode"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/servercfg"
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

	cfgPath := filepath.Join("data", "maps", id+".server.json")
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
	return p.enableMapLocked(id)
}

func (p *Proxy) enableMapLocked(id string) error {
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

// MapServerInfo is the admin view of a map's server.json + registry flags.
type MapServerInfo struct {
	ID            string   `json:"id"`
	Name          string   `json:"name"`
	Enabled       bool     `json:"enabled"`
	Running       bool     `json:"running"`
	Default       bool     `json:"default"`
	ConfigPath    string   `json:"config_path"`
	Overworld     string   `json:"overworld"`
	Addr          string   `json:"addr"`
	BattleSpeed   float64  `json:"battle_speed"`
	Combat        string   `json:"combat"`
	CombatOptions []string `json:"combat_options"`
}

// MapServerUpdate is the admin PUT body for map server options.
type MapServerUpdate struct {
	Enabled     *bool    `json:"enabled"`
	Name        *string  `json:"name"`
	Addr        *string  `json:"addr"`
	BattleSpeed *float64 `json:"battle_speed"`
	Combat      *string  `json:"combat"`
}

func (p *Proxy) MapServerInfo(id string) (MapServerInfo, error) {
	p.mu.Lock()
	spec, ok := p.cfg.MapByID(id)
	p.mu.Unlock()
	if !ok {
		return MapServerInfo{}, fmt.Errorf("map %q not found", id)
	}
	return p.mapServerInfo(spec)
}

func (p *Proxy) mapServerInfo(spec cluster.MapSpec) (MapServerInfo, error) {
	cfg, err := servercfg.Load(spec.Config)
	if err != nil {
		return MapServerInfo{}, err
	}
	return MapServerInfo{
		ID:            spec.ID,
		Name:          spec.Name,
		Enabled:       spec.IsEnabled(),
		Running:       p.mapRunning(spec.ID),
		Default:       spec.Default,
		ConfigPath:    filepath.ToSlash(spec.Config),
		Overworld:     cfg.Server.Overworld,
		Addr:          cfg.Server.Addr,
		BattleSpeed:   cfg.Server.BattleSpeed,
		Combat:        cfg.Plugins.Combat,
		CombatOptions: []string{"combat.realtime", "combat.ordo"},
	}, nil
}

// UpdateMapServer writes editable server.json fields and optionally toggles the map server.
func (p *Proxy) UpdateMapServer(id string, patch MapServerUpdate) (MapServerInfo, error) {
	p.mu.Lock()
	spec, ok := p.cfg.MapByID(id)
	if !ok {
		p.mu.Unlock()
		return MapServerInfo{}, fmt.Errorf("map %q not found", id)
	}
	cfgPath := spec.Config
	wasRunning := p.maps[id] != nil
	wasEnabled := spec.IsEnabled()
	p.mu.Unlock()

	cfg, err := servercfg.Load(cfgPath)
	if err != nil {
		return MapServerInfo{}, err
	}
	restart := false
	if patch.Name != nil {
		name := strings.TrimSpace(*patch.Name)
		if name == "" {
			return MapServerInfo{}, fmt.Errorf("name required")
		}
		if name != cfg.Server.Name {
			cfg.Server.Name = name
			restart = true
		}
	}
	if patch.Addr != nil {
		addr := strings.TrimSpace(*patch.Addr)
		if addr != cfg.Server.Addr {
			cfg.Server.Addr = addr
			restart = true
		}
	}
	if patch.BattleSpeed != nil {
		if *patch.BattleSpeed <= 0 {
			return MapServerInfo{}, fmt.Errorf("battle_speed must be > 0")
		}
		if *patch.BattleSpeed != cfg.Server.BattleSpeed {
			cfg.SetBattleSpeed(*patch.BattleSpeed)
			restart = true
		}
	}
	if patch.Combat != nil {
		combat := strings.TrimSpace(*patch.Combat)
		if combat != cfg.Plugins.Combat {
			if err := cfg.SetCombat(combat); err != nil {
				return MapServerInfo{}, err
			}
			restart = true
		}
	}
	if err := servercfg.Save(cfgPath, cfg); err != nil {
		return MapServerInfo{}, err
	}

	wantEnabled := wasEnabled
	if patch.Enabled != nil {
		wantEnabled = *patch.Enabled
	}
	if patch.Name != nil {
		name := strings.TrimSpace(*patch.Name)
		p.mu.Lock()
		_ = p.cfg.UpdateMap(id, func(m *cluster.MapSpec) {
			m.Name = name
		})
		_ = p.persistCluster()
		p.mu.Unlock()
	}

	if wantEnabled != wasEnabled {
		if wantEnabled {
			if err := p.EnableMap(id); err != nil {
				return MapServerInfo{}, err
			}
		} else {
			if err := p.DisableMap(id); err != nil {
				return MapServerInfo{}, err
			}
		}
	} else if wasRunning && restart {
		if err := p.evacuateMap(id); err != nil {
			log.Printf("proxy: evacuate %s before server restart: %v", id, err)
		}
		p.mu.Lock()
		spec, ok = p.cfg.MapByID(id)
		if !ok {
			p.mu.Unlock()
			return MapServerInfo{}, fmt.Errorf("map %q not found", id)
		}
		p.stopMapLocked(id)
		err := p.startMapLocked(spec)
		p.mu.Unlock()
		if err != nil {
			return MapServerInfo{}, fmt.Errorf("restart map server: %w", err)
		}
		log.Printf("proxy: restarted map %s after server config change", id)
	}

	p.mu.Lock()
	spec, ok = p.cfg.MapByID(id)
	running := p.maps[id] != nil
	p.mu.Unlock()
	if !ok {
		return MapServerInfo{}, fmt.Errorf("map %q not found", id)
	}
	info, err := p.mapServerInfo(spec)
	if err != nil {
		return MapServerInfo{}, err
	}
	info.Running = running
	return info, nil
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
			if strings.HasSuffix(slash, ".server.json") || strings.HasPrefix(slash, "data/config/server.") || strings.HasPrefix(slash, "config/server.") {
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
