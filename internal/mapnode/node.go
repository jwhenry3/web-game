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

	// World is the loaded singular-world definition when this node was started
	// via StartWorld; it is nil for legacy per-map nodes.
	World     *game.WorldDefinition
	WorldSpec cluster.WorldSpec

	// Instance is non-nil for dynamic nodes (e.g. house interiors) created at
	// runtime rather than from cluster config.
	Instance *server.HouseContext

	mu       sync.Mutex
	sessions map[string]*server.Client
	closed   bool // set by MarkClosed during instance teardown

	Forward  func(clientID string, msg []byte)
	Transfer func(req cluster.TransferRequest)
}

// wireTransfer installs the hub's OnTransfer callback so house/instance
// transfers flow through the node's Transfer hook like map transfers.
func (n *Node) wireTransfer() {
	n.Hub.OnTransfer = func(clientID string, dest server.TransferDest) {
		if n.Transfer != nil {
			var house *cluster.HouseSpec
			if dest.House != nil {
				house = &cluster.HouseSpec{
					Owner:     dest.House.Owner,
					Skin:      dest.House.Skin,
					ReturnMap: dest.House.ReturnMap,
					ReturnX:   dest.House.ReturnX,
					ReturnY:   dest.House.ReturnY,
				}
			}
			n.Transfer(cluster.TransferRequest{
				ClientID: clientID, DestMap: dest.Map,
				DestX: dest.X, DestY: dest.Y, Facing: dest.Facing,
				Edge: string(dest.Edge), EdgeT: dest.EdgeT,
				House: house,
			})
		}
	}
}

func Start(spec cluster.MapSpec, profiles *store.Store, accounts *store.AccountStore, layout map[string][2]int) (*Node, error) {
	cfg, err := servercfg.Load(spec.Config)
	if err != nil {
		return nil, err
	}
	ow, err := game.LoadOverworldData(cfg.Server.Overworld)
	if err != nil {
		return nil, err
	}
	hub, err := server.NewHub(profiles, accounts, nil)
	if err != nil {
		return nil, err
	}
	hub.SetMap(spec.ID, spec.Name, ow)
	// World-space placement for map_snapshot: own origin + each bordered
	// neighbor's origin so clients can overlay adjacent terrain.
	origin := layout[spec.ID]
	neighbors := make([]protocol.MapNeighbor, 0, len(ow.Borders))
	for _, b := range ow.Borders {
		if p, ok := layout[b.Map]; ok {
			neighbors = append(neighbors, protocol.MapNeighbor{
				ID: b.Map, X: float64(p[0]), Y: float64(p[1]),
			})
		}
	}
	hub.SetWorldOrigin(float64(origin[0]), float64(origin[1]), neighbors)
	n := &Node{
		Spec:     spec,
		Hub:      hub,
		OW:       ow,
		sessions: map[string]*server.Client{},
	}
	n.wireTransfer()
	go hub.Run()
	log.Printf("map %s (%s) overworld %s", spec.ID, spec.Name, ow.Path)
	return n, nil
}

// StartHouse starts a dynamic house instance node: a generated interior
// overworld on a full hub — no map file, no NPC workers, no persistence of
// the interior position. Occupants enter/leave via the normal transfer path.
func StartHouse(spec *cluster.HouseSpec, profiles *store.Store, accounts *store.AccountStore) (*Node, error) {
	hub, err := server.NewHub(profiles, accounts, nil)
	if err != nil {
		return nil, err
	}
	ow := game.NewHouseOverworld()
	id := server.HouseMapID(spec.Owner)
	ctx := &server.HouseContext{
		Owner:     spec.Owner,
		Skin:      spec.Skin,
		ReturnMap: spec.ReturnMap,
		ReturnX:   spec.ReturnX,
		ReturnY:   spec.ReturnY,
	}
	hub.SetMap(id, "House", ow)
	hub.SetHouseContext(ctx)
	n := &Node{
		Spec:     cluster.MapSpec{ID: id, Name: "House"},
		Hub:      hub,
		OW:       ow,
		Instance: ctx,
		sessions: map[string]*server.Client{},
	}
	n.wireTransfer()
	go hub.Run()
	log.Printf("house instance %s started for %s", id, spec.Owner)
	return n, nil
}

// StartWorld starts a singular-world node from a cluster WorldSpec. It loads
// the server config, builds a WorldDefinition from the configured overworld,
// and runs a single hub for the embedded overworld without wiring border
// transfer callbacks.
func StartWorld(spec cluster.WorldSpec, profiles *store.Store, accounts *store.AccountStore) (*Node, error) {
	cfg, err := servercfg.Load(spec.Config)
	if err != nil {
		return nil, err
	}
	world, err := game.LoadWorldDefinition(cfg.Server.Overworld)
	if err != nil {
		return nil, err
	}
	hub, err := server.NewHub(profiles, accounts, nil)
	if err != nil {
		return nil, err
	}
	hub.SetWorld(spec.ID, spec.Name, world)
	n := &Node{
		Spec: cluster.MapSpec{
			ID:     spec.ID,
			Name:   spec.Name,
			Config: spec.Config,
		},
		WorldSpec: spec,
		World:     world,
		Hub:       hub,
		OW:        world.Overworld,
		sessions:  map[string]*server.Client{},
	}
	n.wireTransfer()
	go hub.Run()
	log.Printf("world %s (%s) overworld %s", spec.ID, spec.Name, world.Overworld.Path)
	return n, nil
}

func (n *Node) Attach(req cluster.AttachRequest) *server.Client {
	n.mu.Lock()
	defer n.mu.Unlock()
	if n.closed {
		return nil
	}
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
		SpawnEdge:   game.BorderEdge(req.Edge),
		SpawnEdgeT:  req.EdgeT,
		CloseFn: func() {
			n.Detach(req.ClientID, false)
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

// Detach unregisters a session. transferring marks proxy-driven transfers so
// the hub can distinguish them from real disconnects (e.g. a camp should not
// be packed up when its owner merely steps inside the house instance).
func (n *Node) Detach(clientID string, transferring bool) {
	n.mu.Lock()
	c, ok := n.sessions[clientID]
	if ok {
		delete(n.sessions, clientID)
	}
	n.mu.Unlock()
	if ok {
		c.Transferring = transferring
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

// MarkClosed refuses further Attach calls; used before stopping a dynamic
// instance so a racing attach cannot orphan a session on a dying node.
func (n *Node) MarkClosed() {
	n.mu.Lock()
	n.closed = true
	n.mu.Unlock()
}

// Closed reports whether MarkClosed has run.
func (n *Node) Closed() bool {
	n.mu.Lock()
	defer n.mu.Unlock()
	return n.closed
}

// StatusCounts returns online players and engaged-foe counts for this map.
func (n *Node) StatusCounts() (players, engaged int) {
	return n.Hub.StatusCounts()
}

// Stop detaches remaining sessions and shuts down the hub loop.
func (n *Node) Stop() {
	n.MarkClosed()
	n.mu.Lock()
	ids := make([]string, 0, len(n.sessions))
	for id := range n.sessions {
		ids = append(ids, id)
	}
	n.mu.Unlock()
	for _, id := range ids {
		n.Detach(id, false)
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
