package mapnode

import (
	"log"
	"sync"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/server"
	"clara-mundi/internal/servercfg"
	"clara-mundi/internal/store"
)

// Node is one map server: overworld, plugins, hub, battles.
type Node struct {
	Spec cluster.MapSpec
	Hub  *server.Hub
	OW   *game.Overworld

	mu       sync.Mutex
	sessions map[string]*server.Client

	Forward  func(clientID string, msg []byte)
	Transfer func(req cluster.TransferRequest)
}

func Start(spec cluster.MapSpec, profiles *store.Store, accounts *store.AccountStore) (*Node, error) {
	cfg, err := servercfg.Load(spec.Config)
	if err != nil {
		return nil, err
	}
	ow, err := game.LoadOverworldData(cfg.Server.Overworld)
	if err != nil {
		return nil, err
	}
	hub, err := server.NewHub(profiles, accounts, nil, cfg.Server.BattleSpeed, cfg.Plugins)
	if err != nil {
		return nil, err
	}
	hub.SetMap(spec.ID, spec.Name, ow)
	n := &Node{
		Spec:     spec,
		Hub:      hub,
		OW:       ow,
		sessions: map[string]*server.Client{},
	}
	hub.OnTransfer = func(clientID, destMap string, destX, destY float64, facing string) {
		if n.Transfer != nil {
			n.Transfer(cluster.TransferRequest{
				ClientID: clientID, DestMap: destMap, DestX: destX, DestY: destY, Facing: facing,
			})
		}
	}
	go hub.Run()
	log.Printf("map %s (%s) overworld %s combat %s", spec.ID, spec.Name, ow.Path, cfg.Plugins.Combat)
	return n, nil
}

func (n *Node) Attach(req cluster.AttachRequest) *server.Client {
	n.mu.Lock()
	defer n.mu.Unlock()
	if c, ok := n.sessions[req.ClientID]; ok {
		return c
	}
	c := &server.Client{
		ID:          req.ClientID,
		Send:        make(chan []byte, 256),
		Hub:         n.Hub,
		AccountID:   req.AccountID,
		Username:    req.Username,
		SpawnX:      req.SpawnX,
		SpawnY:      req.SpawnY,
		UseSpawn:    req.UseSpawn,
		SpawnFacing: req.Facing,
		CloseFn: func() {
			n.Detach(req.ClientID)
		},
	}
	n.sessions[req.ClientID] = c
	n.Hub.Register(c)
	go n.pump(c)
	return c
}

func (n *Node) pump(c *server.Client) {
	for msg := range c.Send {
		if n.Forward != nil {
			n.Forward(c.ID, msg)
		}
	}
}

// ReloadOverworld reloads the map from disk (including overrides) and streams
// the updated world to clients connected to this map node.
func (n *Node) ReloadOverworld() error {
	cfg, err := servercfg.Load(n.Spec.Config)
	if err != nil {
		return err
	}
	ow, err := game.LoadOverworldData(cfg.Server.Overworld)
	if err != nil {
		return err
	}
	n.OW = ow
	n.Hub.ApplyOverworldReload(n.Spec.ID, n.Spec.Name, ow)
	return nil
}

func (n *Node) Detach(clientID string) {
	n.mu.Lock()
	c, ok := n.sessions[clientID]
	if ok {
		delete(n.sessions, clientID)
	}
	n.mu.Unlock()
	if ok {
		n.Hub.Unregister(c)
	}
}

// SessionIDs returns client IDs currently attached to this map node.
func (n *Node) SessionIDs() []string {
	n.mu.Lock()
	defer n.mu.Unlock()
	out := make([]string, 0, len(n.sessions))
	for id := range n.sessions {
		out = append(out, id)
	}
	return out
}

// Stop detaches remaining sessions and shuts down the hub loop.
func (n *Node) Stop() {
	n.mu.Lock()
	ids := make([]string, 0, len(n.sessions))
	for id := range n.sessions {
		ids = append(ids, id)
	}
	n.mu.Unlock()
	for _, id := range ids {
		n.Detach(id)
	}
	game.UnregisterSavePointsForMap(n.Spec.ID)
	n.Hub.Stop()
	log.Printf("map %s stopped", n.Spec.ID)
}

func (n *Node) Handle(clientID string, env protocol.Envelope) {
	n.mu.Lock()
	c := n.sessions[clientID]
	n.mu.Unlock()
	if c == nil {
		return
	}
	n.Hub.PushEvent(server.Event{Type: env.Type, Payload: env.Payload, Sender: c})
}

func (n *Node) KickByCharacterName(name string) {
	n.Hub.KickByCharacterName(name)
}

func (n *Node) AtlasMap() protocol.AtlasMap {
	return n.Hub.AtlasMap()
}

func (n *Node) CharacterName(clientID string) string {
	n.mu.Lock()
	defer n.mu.Unlock()
	if c := n.sessions[clientID]; c != nil {
		return c.Name
	}
	return ""
}
