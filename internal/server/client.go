package server

import (
	"encoding/json"
	"log"
	"time"

	"ffv-web-game/internal/protocol"

	"github.com/gorilla/websocket"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 4096
)

// Client is the edge of the system: one goroutine pair per WebSocket
// connection (ReadPump for incoming, WritePump for outgoing).
type Client struct {
	ID   string
	Conn *websocket.Conn
	Send chan []byte
	Hub  *Hub

	// The fields below are owned by the hub goroutine.
	AccountID string
	Username  string
	Name      string
	Joined   bool
	BattleID string
}

func (c *Client) ReadPump() {
	defer func() {
		c.Hub.unregister <- c
		c.Conn.Close()
	}()
	c.Conn.SetReadLimit(maxMessageSize)
	c.Conn.SetReadDeadline(time.Now().Add(pongWait))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err, websocket.CloseGoingAway, websocket.CloseNormalClosure) {
				log.Printf("client %s read error: %v", c.ID, err)
			}
			break
		}

		var envelope protocol.Envelope
		if err := json.Unmarshal(message, &envelope); err != nil {
			log.Printf("client %s sent malformed envelope: %v", c.ID, err)
			continue
		}

		c.Hub.events <- Event{Type: envelope.Type, Payload: envelope.Payload, Sender: c}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()
	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}
		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
