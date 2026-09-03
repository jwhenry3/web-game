package proxy

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"sync"
	"time"

	"ffv-web-game/internal/auth"
	"ffv-web-game/internal/cluster"
	"ffv-web-game/internal/mapnode"
	"ffv-web-game/internal/plugins"
	"ffv-web-game/internal/protocol"
	"ffv-web-game/internal/server"
	"ffv-web-game/internal/servercfg"
	"ffv-web-game/internal/store"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

type session struct {
	id     string
	conn   *websocket.Conn
	send   chan []byte
	mapID  string
	acctID string
	user   string
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

	mu   sync.Mutex
	maps map[string]*mapnode.Node
	sess map[string]*session
}

func New(cfg cluster.Config, cfgPath string, tokens *auth.TokenIssuer, accounts *store.AccountStore, profiles *store.Store, adminSecret string) *Proxy {
	p := &Proxy{
		cfg:         cfg,
		cfgPath:     cfgPath,
		tokens:      tokens,
		accounts:    accounts,
		profiles:    profiles,
		adminSecret: adminSecret,
		maps:        map[string]*mapnode.Node{},
		sess:        map[string]*session{},
	}
	p.auth = server.NewAuthHandler(accounts, profiles, tokens, p)
	return p
}

func (p *Proxy) RegisterMap(n *mapnode.Node) {
	n.Forward = func(clientID string, msg []byte) {
		p.sendToClient(clientID, msg)
	}
	n.Transfer = func(req cluster.TransferRequest) {
		p.handleTransfer(req)
	}
	p.mu.Lock()
	p.maps[n.Spec.ID] = n
	p.mu.Unlock()
}

func (p *Proxy) KickByCharacterName(name string) {
	p.mu.Lock()
	nodes := make([]*mapnode.Node, 0, len(p.maps))
	for _, n := range p.maps {
		nodes = append(nodes, n)
	}
	p.mu.Unlock()
	for _, n := range nodes {
		n.KickByCharacterName(name)
	}
}

func (p *Proxy) Handler() http.Handler {
	modCfg := plugins.Config{}
	if spec := p.cfg.DefaultMap(); spec.Config != "" {
		if mc, err := servercfg.Load(spec.Config); err == nil {
			modCfg = mc.Plugins
		}
	}
	apiMux := http.NewServeMux()
	server.RegisterAPIRoutes(apiMux, p.auth, modCfg)
	apiMux.HandleFunc("/atlas", p.handleAtlas)
	admin := &AdminMapsHandler{
		Secret:   p.adminSecret,
		Accounts: p.accounts,
		Tokens:   p.tokens,
		Proxy:    p,
	}
	admin.Register(apiMux)
	publicMaps := &PublicMapsHandler{
		Proxy: p,
	}
	publicMaps.Register(apiMux)

	mux := http.NewServeMux()
	mux.Handle("/api/", http.StripPrefix("/api", apiMux))
	mux.HandleFunc("/ws", p.handleWS)

	if info, err := os.Stat(p.cfg.Proxy.Static); err == nil && info.IsDir() {
		mux.Handle("/", http.FileServer(http.Dir(p.cfg.Proxy.Static)))
		log.Printf("serving frontend from %s", p.cfg.Proxy.Static)
	}
	return mux
}

func (p *Proxy) handleAtlas(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	p.mu.Lock()
	nodes := make(map[string]*mapnode.Node, len(p.maps))
	for id, n := range p.maps {
		nodes[id] = n
	}
	specs := append([]cluster.MapSpec(nil), p.cfg.Maps...)
	p.mu.Unlock()
	maps := make([]protocol.AtlasMap, 0, len(specs))
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
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(protocol.AtlasPayload{Maps: maps})
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
	}
	p.mu.Lock()
	p.sess[id] = s
	p.mu.Unlock()
	log.Printf("proxy session %s connected", id)
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
		var env protocol.Envelope
		if err := json.Unmarshal(message, &env); err != nil {
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
			if err := s.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
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
	p.mu.Lock()
	n := p.maps[mapID]
	p.mu.Unlock()
	if n == nil {
		return false
	}
	c := n.Attach(req)
	c.CloseFn = func() {
		s.conn.Close()
	}
	s.mapID = mapID
	return true
}

func (p *Proxy) handleTransfer(req cluster.TransferRequest) {
	if !p.cfg.CanTravelTo(req.DestMap) {
		log.Printf("proxy: rejected transfer to unavailable map %q", req.DestMap)
		p.sendToClient(req.ClientID, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Cannot travel there."}))
		return
	}
	p.mu.Lock()
	s := p.sess[req.ClientID]
	var src *mapnode.Node
	srcMapID := ""
	if s != nil {
		srcMapID = s.mapID
		src = p.maps[s.mapID]
	}
	dst := p.maps[req.DestMap]
	p.mu.Unlock()
	if s == nil || dst == nil {
		p.sendToClient(req.ClientID, protocol.Encode(protocol.TypeError, protocol.ErrorPayload{Message: "Destination unavailable."}))
		return
	}
	if src != nil && src.Spec.ID == req.DestMap {
		return
	}
	name := ""
	if src != nil {
		name = src.CharacterName(s.id)
		src.Detach(s.id)
	}
	if !p.attach(s, req.DestMap, cluster.AttachRequest{
		ClientID: s.id, AccountID: s.acctID, Username: s.user,
		SpawnX: req.DestX, SpawnY: req.DestY, UseSpawn: true, Facing: req.Facing,
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

func (p *Proxy) sendToClient(clientID string, msg []byte) {
	p.mu.Lock()
	s := p.sess[clientID]
	p.mu.Unlock()
	if s == nil || msg == nil {
		return
	}
	select {
	case s.send <- msg:
	default:
		log.Printf("proxy: session %s send buffer full", clientID)
	}
}

func (p *Proxy) drop(s *session) {
	p.mu.Lock()
	delete(p.sess, s.id)
	n := p.maps[s.mapID]
	p.mu.Unlock()
	if n != nil {
		n.Detach(s.id)
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
