package proxy

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"clara-mundi/internal/auth"
	"clara-mundi/internal/cluster"
	"clara-mundi/internal/mapnode"
	"clara-mundi/internal/protocol"
	"clara-mundi/internal/server"
	"clara-mundi/internal/store"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 2 << 20 // 2 MiB — map snapshots / terrain layers
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
	Subprotocols:    []string{protocol.SubprotocolProtobuf},
}

type session struct {
	id     string
	conn   *websocket.Conn
	send   chan []byte
	mapID  string
	acctID string
	user   string
	codec  protocol.Codec
}

// Proxy is the global edge: auth, one client WebSocket, and map routing.
type Proxy struct {
	cfg         cluster.Config
	cfgPath     string
	tokens      *auth.TokenIssuer
	accounts    *store.AccountStore
	profiles    *store.Store
	auth        *server.AuthHandler
	adminSecret string
	startedAt   time.Time
	// restartFn reboots the owning host.Runtime in place — set by host.Start
	// via SetRestartFunc; the admin API uses it for full cluster restarts.
	restartFn func() error

	mu    sync.Mutex
	maps  map[string]*mapnode.Node
	world *mapnode.Node
	sess  map[string]*session

	// convCache deduplicates protobuf conversion for broadcasts: the hub
	// marshals one JSON frame and the same slice reaches sendToClient once
	// per client, so a single-entry cache converts it once per frame.
	convMu  sync.Mutex
	convSrc []byte
	convDst []byte

	// mapimgCache holds rendered terrain PNGs for /api/mapimg, keyed by map
	// id. Terrain is static at runtime so entries never expire.
	mapimgMu    sync.Mutex
	mapimgCache map[string][]byte
}

func New(cfg cluster.Config, cfgPath string, tokens *auth.TokenIssuer, accounts *store.AccountStore, profiles *store.Store, adminSecret string) *Proxy {
	p := &Proxy{
		cfg:         cfg,
		cfgPath:     cfgPath,
		tokens:      tokens,
		accounts:    accounts,
		profiles:    profiles,
		adminSecret: adminSecret,
		startedAt:   time.Now(),
		maps:        map[string]*mapnode.Node{},
		sess:        map[string]*session{},
	}
	p.auth = server.NewAuthHandler(accounts, profiles, tokens, p)
	return p
}

// SetRestartFunc wires the host runtime's in-place restart into the admin API.
func (p *Proxy) SetRestartFunc(fn func() error) {
	p.mu.Lock()
	p.restartFn = fn
	p.mu.Unlock()
}

// RestartFunc returns the configured cluster restart hook, if any.
func (p *Proxy) RestartFunc() func() error {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.restartFn
}

func (p *Proxy) RegisterMap(n *mapnode.Node) {
	n.Forward = func(clientID string, msg []byte) {
		p.sendToClient(clientID, msg)
	}
	n.Transfer = func(req cluster.TransferRequest) {
		p.handleTransfer(req)
	}
	n.Hub.OnCloseHouse = func(owner, reason string) {
		p.closeHouseInstance(owner, reason)
	}
	p.mu.Lock()
	p.maps[n.Spec.ID] = n
	p.mu.Unlock()
}

func (p *Proxy) RegisterWorld(n *mapnode.Node) {
	n.Forward = func(clientID string, msg []byte) {
		p.sendToClient(clientID, msg)
	}
	// The world node transfers sessions into dynamic house instances.
	n.Transfer = func(req cluster.TransferRequest) {
		p.handleTransfer(req)
	}
	n.Hub.OnCloseHouse = func(owner, reason string) {
		p.closeHouseInstance(owner, reason)
	}
	p.mu.Lock()
	p.world = n
	p.mu.Unlock()
}

func (p *Proxy) KickByCharacterName(name string) {
	p.mu.Lock()
	nodes := make([]*mapnode.Node, 0, len(p.maps)+1)
	for _, n := range p.maps {
		nodes = append(nodes, n)
	}
	if p.world != nil {
		nodes = append(nodes, p.world)
	}
	p.mu.Unlock()
	for _, n := range nodes {
		n.KickByCharacterName(name)
	}
}

func (p *Proxy) Handler() http.Handler {
	apiMux := http.NewServeMux()
	server.RegisterAPIRoutes(apiMux, p.auth)
	apiMux.HandleFunc("/atlas", p.handleAtlas)
	apiMux.HandleFunc("/mapimg", p.handleMapImage)
	apiMux.HandleFunc("/status", p.handleStatus)
	admin := &AdminMapsHandler{
		Secret:   p.adminSecret,
		Accounts: p.accounts,
		Tokens:   p.tokens,
		Proxy:    p,
	}
	admin.Register(apiMux)
	content := &AdminContentHandler{Maps: admin}
	content.Register(apiMux)
	publicMaps := &PublicMapsHandler{
		Proxy: p,
	}
	publicMaps.Register(apiMux)
	publicContent := &PublicContentHandler{}
	publicContent.Register(apiMux)

	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", apiMux))
	mux.HandleFunc("/ws", p.handleWS)
	mux.HandleFunc("/status/ws", p.handleStatusWS)

	if info, err := os.Stat(p.cfg.Proxy.Static); err == nil && info.IsDir() {
		mux.Handle("/", spaFileServer(p.cfg.Proxy.Static))
		log.Printf("serving content site from %s", p.cfg.Proxy.Static)
	}
	return mux
}

func (p *Proxy) handleAtlas(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(protocol.AtlasPayload{Maps: p.atlasMaps()})
}

// atlasMaps collects the live atlas entries — the world node's terrain in
// singular-world mode, otherwise every enabled running map node.
func (p *Proxy) atlasMaps() []protocol.AtlasMap {
	p.mu.Lock()
	world := p.world
	worldMode := p.cfg.HasWorld() || world != nil
	nodes := make(map[string]*mapnode.Node, len(p.maps))
	for id, n := range p.maps {
		nodes[id] = n
	}
	specs := append([]cluster.MapSpec(nil), p.cfg.Maps...)
	p.mu.Unlock()
	maps := make([]protocol.AtlasMap, 0, len(specs))
	if worldMode {
		// Singular-world mode: the atlas is exactly the world node's terrain.
		// Legacy map specs stay in the registry but are not running.
		if world != nil {
			maps = append(maps, world.AtlasMap())
		}
	} else {
		for _, spec := range specs {
			if !spec.IsEnabled() {
				continue
			}
			n := nodes[spec.ID]
			if n == nil {
				continue
			}
			maps = append(maps, n.AtlasMap())
		}
	}
	return maps
}

func (p *Proxy) handleWS(w http.ResponseWriter, r *http.Request) {
	token := r.URL.Query().Get("token")
	if token == "" {
		h := r.Header.Get("Authorization")
		if len(h) > 7 && h[:7] == "Bearer " {
			token = h[7:]
		}
	}
	var accountID, username string
	if token != "" {
		claims, err := p.tokens.Parse(token)
		if err != nil {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		accountID = claims.AccountID
		username = claims.Username
	}

	codec := protocol.CodecJSON
	if protocol.ParseCodec(r.URL.Query().Get("codec")) == protocol.CodecProtobuf {
		codec = protocol.CodecProtobuf
	}
	for _, sp := range websocket.Subprotocols(r) {
		if sp == protocol.SubprotocolProtobuf {
			codec = protocol.CodecProtobuf
			break
		}
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("upgrade error: %v", err)
		return
	}
	id := newID()
	s := &session{
		id:     id,
		conn:   conn,
		send:   make(chan []byte, 256),
		acctID: accountID,
		user:   username,
		codec:  codec,
	}
	p.mu.Lock()
	p.sess[id] = s
	p.mu.Unlock()
	log.Printf("proxy session %s connected codec=%s", id, codec)
	go p.writePump(s)
	p.readPump(s)
}

func (p *Proxy) readPump(s *session) {
	defer func() {
		p.drop(s)
		s.conn.Close()
	}()
	s.conn.SetReadLimit(maxMessageSize)
	s.conn.SetReadDeadline(time.Now().Add(pongWait))
	s.conn.SetPongHandler(func(string) error {
		s.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})
	for {
		_, message, err := s.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("session %s read error: %v", s.id, err)
			}
			break
		}
		env, err := protocol.DecodeRequestFrame(s.codec, message)
		if err != nil {
			log.Printf("session %s bad frame: %v", s.id, err)
			continue
		}
		p.route(s, env)
	}
}

func (p *Proxy) writePump(s *session) {
	ticker := time.NewTicker(pingPeriod)
	defer ticker.Stop()
	for {
		select {
		case msg, ok := <-s.send:
			s.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				s.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			msgType := websocket.TextMessage
			if s.codec == protocol.CodecProtobuf {
				msgType = websocket.BinaryMessage
			}
			if err := s.conn.WriteMessage(msgType, msg); err != nil {
				return
			}
		case <-ticker.C:
			s.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := s.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func (p *Proxy) route(s *session, env protocol.Envelope) {
	if p.world != nil {
		if env.Type == protocol.TypeJoinWorld && s.mapID == "" {
			s.mapID = p.world.Spec.ID
			if !p.attach(s, s.mapID, cluster.AttachRequest{
				ClientID: s.id, AccountID: s.acctID, Username: s.user,
			}) {
				p.sendToClient(s.id, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "World server unavailable."}))
				return
			}
		}
		if s.mapID == "" {
			p.sendToClient(s.id, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Join the world first."}))
			return
		}
		// Sessions bound to a dynamic instance (house:<owner>) route to that
		// node; everything else lands on the world node.
		if n := p.nodeFor(s.mapID); n != nil {
			n.Handle(s.id, env)
		}
		return
	}
	if env.Type == protocol.TypeJoinWorld && s.mapID == "" {
		mapID := p.pickMap(s, env)
		if !p.attach(s, mapID, cluster.AttachRequest{
			ClientID: s.id, AccountID: s.acctID, Username: s.user,
		}) {
			p.sendToClient(s.id, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Map server unavailable."}))
			return
		}
	}
	p.mu.Lock()
	n := p.maps[s.mapID]
	p.mu.Unlock()
	if n == nil {
		p.sendToClient(s.id, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Join the world first."}))
		return
	}
	n.Handle(s.id, env)
}

// nodeFor resolves the node bound to a session's map id. Configured maps and
// dynamic house instances live in p.maps; the singular world node is
// registered separately.
func (p *Proxy) nodeFor(mapID string) *mapnode.Node {
	p.mu.Lock()
	defer p.mu.Unlock()
	if n := p.maps[mapID]; n != nil {
		return n
	}
	if p.world != nil && p.world.Spec.ID == mapID {
		return p.world
	}
	return nil
}

func (p *Proxy) pickMap(s *session, env protocol.Envelope) string {
	def := p.cfg.DefaultMap().ID
	var join protocol.JoinWorldPayload
	if err := json.Unmarshal(env.Payload, &join); err != nil {
		return def
	}
	name := join.PlayerName
	if name == "" {
		return def
	}
	if prof, ok := p.profiles.Get(name); ok && prof.MapID != "" && p.cfg.CanTravelTo(prof.MapID) && p.mapRunning(prof.MapID) {
		if s.acctID != "" && prof.AccountID != "" && prof.AccountID != s.acctID {
			return def
		}
		return prof.MapID
	}
	return def
}

func (p *Proxy) attach(s *session, mapID string, req cluster.AttachRequest) bool {
	n := p.nodeFor(mapID)
	if n == nil {
		return false
	}
	c := n.Attach(req)
	if c == nil {
		return false
	}
	c.CloseFn = func() {
		s.conn.Close()
	}
	s.mapID = mapID
	return true
}

func (p *Proxy) handleTransfer(req cluster.TransferRequest) {
	_, isHouse := server.ParseHouseMapID(req.DestMap)
	if !isHouse && req.DestMap != p.worldID() && !p.cfg.CanTravelTo(req.DestMap) {
		log.Printf("proxy: rejected transfer to unavailable map %q", req.DestMap)
		p.sendToClient(req.ClientID, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Cannot travel there."}))
		return
	}
	p.mu.Lock()
	s := p.sess[req.ClientID]
	p.mu.Unlock()
	if s == nil {
		p.sendToClient(req.ClientID, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Destination unavailable."}))
		return
	}
	srcMapID := s.mapID
	src := p.nodeFor(srcMapID)
	dst := p.nodeFor(req.DestMap)
	if dst == nil && isHouse {
		dst = p.ensureHouseNode(req)
	}
	if dst == nil {
		p.sendToClient(req.ClientID, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Destination unavailable."}))
		return
	}
	if src != nil && src == dst {
		return
	}
	name := ""
	if src != nil {
		name = src.CharacterName(s.id)
		src.Detach(s.id, true)
		// An emptied instance tears itself down once its last occupant leaves.
		p.teardownIfEmpty(src)
	}
	if !p.attach(s, req.DestMap, cluster.AttachRequest{
		ClientID: s.id, AccountID: s.acctID, Username: s.user,
		SpawnX: req.DestX, SpawnY: req.DestY, UseSpawn: true, Facing: req.Facing,
		Edge: req.Edge, EdgeT: req.EdgeT,
	}) {
		// Reattach to source if possible so the player is not stranded.
		if srcMapID != "" && srcMapID != req.DestMap && p.mapRunning(srcMapID) {
			_ = p.attach(s, srcMapID, cluster.AttachRequest{
				ClientID: s.id, AccountID: s.acctID, Username: s.user,
			})
		}
		p.sendToClient(s.id, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Destination unavailable."}))
		return
	}
	if name == "" {
		return
	}
	raw, _ := json.Marshal(protocol.JoinWorldPayload{PlayerName: name})
	dst.Handle(s.id, protocol.Envelope{Type: protocol.TypeJoinWorld, Payload: raw})
	log.Printf("proxy: %s transferred to %s", s.id, req.DestMap)
}

func (p *Proxy) worldID() string {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.world != nil {
		return p.world.Spec.ID
	}
	return ""
}

func (p *Proxy) worldNode() *mapnode.Node {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.world
}

// ensureHouseNode lazily creates a dynamic house instance node the first
// time someone transfers into it. The HouseSpec on the request carries the
// owner/skin/return position captured by the source hub.
func (p *Proxy) ensureHouseNode(req cluster.TransferRequest) *mapnode.Node {
	spec := req.House
	if spec == nil {
		owner, _ := server.ParseHouseMapID(req.DestMap)
		spec = &cluster.HouseSpec{
			Owner:     owner,
			ReturnMap: p.worldID(),
			ReturnX:   req.DestX,
			ReturnY:   req.DestY,
		}
	}
	p.mu.Lock()
	defer p.mu.Unlock()
	if n := p.maps[req.DestMap]; n != nil {
		return n
	}
	n, err := mapnode.StartHouse(spec, p.profiles, p.accounts)
	if err != nil {
		log.Printf("proxy: cannot start house instance %s: %v", req.DestMap, err)
		return nil
	}
	n.Forward = func(clientID string, msg []byte) {
		p.sendToClient(clientID, msg)
	}
	n.Transfer = func(r cluster.TransferRequest) {
		p.handleTransfer(r)
	}
	returnMap := spec.ReturnMap
	n.Hub.OnCampSkinChanged = func(owner, skin string) {
		if src := p.nodeFor(returnMap); src != nil {
			src.Hub.PostTask(func() { src.Hub.UpdateCampSkin(owner, skin) })
		}
	}
	p.maps[req.DestMap] = n
	return n
}

// teardownIfEmpty stops a dynamic instance once its last session detaches.
// Static configured maps are never torn down.
func (p *Proxy) teardownIfEmpty(n *mapnode.Node) {
	if n == nil || n.Instance == nil {
		return
	}
	p.mu.Lock()
	if p.maps[n.Spec.ID] != n || len(n.SessionIDs()) != 0 {
		p.mu.Unlock()
		return
	}
	n.MarkClosed()
	delete(p.maps, n.Spec.ID)
	p.mu.Unlock()
	go n.Stop()
	log.Printf("instance %s torn down (empty)", n.Spec.ID)
}

// closeHouseInstance evicts every occupant of a house instance; the
// per-detach teardown path then removes the empty node. Called from the
// world hub when the owning camp despawns — it must not block that hub.
func (p *Proxy) closeHouseInstance(owner, reason string) {
	n := p.nodeFor(server.HouseMapID(owner))
	if n == nil || n.Instance == nil {
		return
	}
	n.Hub.PostTask(func() { n.Hub.EvictHouse(reason) })
}

// StopInstances shuts down every dynamic instance node (house interiors).
// Called on process shutdown alongside the configured nodes.
func (p *Proxy) StopInstances() {
	p.mu.Lock()
	nodes := make([]*mapnode.Node, 0)
	for id, n := range p.maps {
		if n.Instance == nil {
			continue
		}
		n.MarkClosed()
		delete(p.maps, id)
		nodes = append(nodes, n)
	}
	p.mu.Unlock()
	for _, n := range nodes {
		n.Stop()
	}
}

func (p *Proxy) sendToClient(clientID string, msg []byte) {
	p.mu.Lock()
	s := p.sess[clientID]
	p.mu.Unlock()
	if s == nil || msg == nil {
		return
	}
	out := msg
	if s.codec == protocol.CodecProtobuf {
		converted, err := p.convertFrame(msg)
		if err != nil {
			log.Printf("proxy: session %s protobuf encode: %v", clientID, err)
			return
		}
		out = converted
	}
	select {
	case s.send <- out:
	default:
		log.Printf("proxy: session %s send buffer full", clientID)
	}
}

// convertFrame JSON→protobuf converts a hub frame once per unique frame: map
// broadcasts hand the identical slice to every protobuf session, so the
// conversion result is cached keyed by the source bytes.
func (p *Proxy) convertFrame(msg []byte) ([]byte, error) {
	p.convMu.Lock()
	if len(msg) > 0 && len(msg) == len(p.convSrc) &&
		&msg[0] == &p.convSrc[0] && bytes.Equal(msg, p.convSrc) {
		dst := p.convDst
		p.convMu.Unlock()
		return dst, nil
	}
	p.convMu.Unlock()

	out, err := protocol.EncodeFrame(protocol.CodecProtobuf, msg)
	if err != nil {
		return nil, err
	}
	p.convMu.Lock()
	p.convSrc, p.convDst = msg, out
	p.convMu.Unlock()
	return out, nil
}

func (p *Proxy) drop(s *session) {
	p.mu.Lock()
	delete(p.sess, s.id)
	p.mu.Unlock()
	n := p.nodeFor(s.mapID)
	if n != nil {
		// A real disconnect inside an instance mirrors the old in-house
		// logout rules: the character's own camp unpitches, which also
		// evicts remaining guests when the house owner logs out.
		if n.Instance != nil {
			if world := p.worldNode(); world != nil {
				if name := n.CharacterName(s.id); name != "" {
					world.Hub.PostTask(func() {
						world.Hub.DespawnCamp(name, "The camp was packed up.")
					})
				}
			}
		}
		n.Detach(s.id, false)
		p.teardownIfEmpty(n)
	}
	close(s.send)
	log.Printf("proxy session %s disconnected", s.id)
}

func newID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "p-fallback"
	}
	return "p-" + hex.EncodeToString(b)
}
