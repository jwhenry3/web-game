// Package clientnet is the shared Go game client: WebSocket transport and
// local overworld prediction using internal/game. Used by the Wails desktop
// app; keep free of Wails runtime so it stays reusable.
package clientnet

import (
	"encoding/json"
	"fmt"
	"net/url"
	"sync"
	"time"

	"ffv-web-game/internal/game"
	"ffv-web-game/internal/protocol"

	"github.com/gorilla/websocket"
)

// Conn is a client WebSocket to the game proxy.
// Wire format defaults to protobuf; OnEnvelope always receives JSON frames
// so the React/Phaser layer can keep using the existing handlers.
type Conn struct {
	mu               sync.Mutex
	conn             *websocket.Conn
	intentionalClose bool
	codec            protocol.Codec

	OnEnvelope     func([]byte) // JSON envelope bytes
	OnConnected    func()
	OnDisconnected func(intentional bool)
	OnError        func(string)
}

func (c *Conn) Connect(wsURL string) error {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn != nil {
		_ = c.conn.Close()
		c.conn = nil
	}
	if c.codec == "" {
		c.codec = protocol.CodecProtobuf
	}
	wsURL = ensureCodecQuery(wsURL, c.codec)

	dialer := websocket.Dialer{
		HandshakeTimeout: 10 * time.Second,
		Subprotocols:     []string{protocol.SubprotocolProtobuf},
	}
	conn, _, err := dialer.Dial(wsURL, nil)
	if err != nil {
		return err
	}
	c.conn = conn
	c.intentionalClose = false
	go c.readLoop()
	if c.OnConnected != nil {
		c.OnConnected()
	}
	return nil
}

func ensureCodecQuery(raw string, codec protocol.Codec) string {
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	q := u.Query()
	if q.Get("codec") == "" {
		q.Set("codec", string(codec))
		u.RawQuery = q.Encode()
	}
	return u.String()
}

func (c *Conn) readLoop() {
	for {
		c.mu.Lock()
		conn := c.conn
		codec := c.codec
		c.mu.Unlock()
		if conn == nil {
			return
		}
		_, data, err := conn.ReadMessage()
		if err != nil {
			c.handleClose(err)
			return
		}
		env, err := protocol.DecodeFrame(codec, data)
		if err != nil {
			continue
		}
		jsonFrame, err := json.Marshal(env)
		if err != nil {
			continue
		}
		if c.OnEnvelope != nil {
			c.OnEnvelope(jsonFrame)
		}
	}
}

func (c *Conn) handleClose(err error) {
	c.mu.Lock()
	intentional := c.intentionalClose
	c.intentionalClose = false
	c.conn = nil
	cb := c.OnDisconnected
	c.mu.Unlock()
	if cb != nil {
		cb(intentional)
	}
	if !intentional && err != nil && c.OnError != nil {
		c.OnError("Disconnected from server.")
	}
}

func (c *Conn) Send(typeName string, payload any) error {
	c.mu.Lock()
	conn := c.conn
	codec := c.codec
	if codec == "" {
		codec = protocol.CodecProtobuf
	}
	c.mu.Unlock()
	if conn == nil {
		return fmt.Errorf("not connected")
	}

	jsonFrame := protocol.Encode(protocol.MessageType(typeName), payload)
	if jsonFrame == nil {
		// Encode logs and returns nil on marshal failure; also handles nil payload oddly.
		env := protocol.Envelope{Type: protocol.MessageType(typeName)}
		if payload != nil {
			raw, err := json.Marshal(payload)
			if err != nil {
				return err
			}
			env.Payload = raw
		}
		var err error
		jsonFrame, err = json.Marshal(env)
		if err != nil {
			return err
		}
	}

	frame, err := protocol.EncodeFrame(codec, jsonFrame)
	if err != nil {
		return err
	}
	msgType := websocket.TextMessage
	if codec == protocol.CodecProtobuf {
		msgType = websocket.BinaryMessage
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.conn == nil {
		return fmt.Errorf("not connected")
	}
	return c.conn.WriteMessage(msgType, frame)
}

func (c *Conn) Disconnect() {
	c.mu.Lock()
	c.intentionalClose = true
	conn := c.conn
	c.conn = nil
	c.mu.Unlock()
	if conn != nil {
		_ = conn.Close()
	}
}

func (c *Conn) Connected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

// WSURL builds ws(s)://host/ws?token=… from an HTTP(S) base URL.
func WSURL(base, token string) (string, error) {
	u, err := url.Parse(base)
	if err != nil {
		return "", err
	}
	switch u.Scheme {
	case "http":
		u.Scheme = "ws"
	case "https":
		u.Scheme = "wss"
	case "ws", "wss":
	default:
		u.Scheme = "ws"
	}
	u.Path = "/ws"
	q := u.Query()
	q.Set("token", token)
	q.Set("codec", string(protocol.CodecProtobuf))
	u.RawQuery = q.Encode()
	return u.String(), nil
}

// Predictor keeps a local overworld copy for client-side movement prediction.
type Predictor struct {
	mu        sync.Mutex
	overworld *game.Overworld
	selfX     float64
	selfY     float64
}

func (p *Predictor) SetOverworld(ow *game.Overworld) {
	if ow == nil {
		return
	}
	p.mu.Lock()
	p.overworld = ow
	p.mu.Unlock()
}

func (p *Predictor) OverworldFromWire(om protocol.OverworldMap) *game.Overworld {
	if om.Cols <= 0 || om.Rows <= 0 || om.Tile <= 0 {
		return nil
	}
	need := om.Cols * om.Rows
	if len(om.Cells) < need {
		return nil
	}
	rows := make([]string, om.Rows)
	for r := 0; r < om.Rows; r++ {
		start := r * om.Cols
		rows[r] = om.Cells[start : start+om.Cols]
	}
	return &game.Overworld{
		Cols:     om.Cols,
		Rows:     om.Rows,
		TileSize: om.Tile,
		Cells:    rows,
		WorldW:   om.Cols * om.Tile,
		WorldH:   om.Rows * om.Tile,
	}
}

func (p *Predictor) UpdateFromEnvelope(envType string, payload []byte) {
	switch envType {
	case string(protocol.TypeWelcome):
		var wp protocol.WelcomePayload
		if err := json.Unmarshal(payload, &wp); err != nil || wp.Map == nil {
			return
		}
		p.SetOverworld(p.OverworldFromWire(wp.Map.Overworld))
	case string(protocol.TypeMapConfig):
		var mp protocol.MapConfigPayload
		if err := json.Unmarshal(payload, &mp); err != nil || mp.Map == nil {
			return
		}
		p.SetOverworld(p.OverworldFromWire(mp.Map.Overworld))
	case string(protocol.TypeWorldState):
		var ws protocol.WorldStatePayload
		if err := json.Unmarshal(payload, &ws); err != nil {
			return
		}
		p.SetOverworld(p.OverworldFromWire(ws.Map))
	}
}

func (p *Predictor) StepMove(fromX, fromY, toX, toY float64) (float64, float64) {
	p.mu.Lock()
	ow := p.overworld
	p.mu.Unlock()

	x, y := fromX, fromY
	if ow != nil {
		x, y = ow.SlideMovePlayer(fromX, fromY, toX, toY)
	} else {
		x, y = game.SlideMovePlayer(fromX, fromY, toX, toY)
	}

	p.mu.Lock()
	p.selfX, p.selfY = x, y
	p.mu.Unlock()
	return x, y
}

func (p *Predictor) Position() (float64, float64) {
	p.mu.Lock()
	defer p.mu.Unlock()
	return p.selfX, p.selfY
}
