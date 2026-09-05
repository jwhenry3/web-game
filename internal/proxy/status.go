package proxy

import (
	"encoding/json"
	"log"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
	"time"

	"clara-mundi/internal/cluster"
	"clara-mundi/internal/mapnode"

	"github.com/gorilla/websocket"
)

const statusPushInterval = 2 * time.Second

var statusUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin:     func(r *http.Request) bool { return true },
}

// StatusExpRates is the public EXP slice of cluster config.
type StatusExpRates struct {
	Rate        float64 `json:"rate"`
	MainPercent int     `json:"main_percent"`
	SubPercent  int     `json:"sub_percent"`
}

// StatusMapEntry is one map's public status line.
type StatusMapEntry struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Enabled bool   `json:"enabled"`
	Running bool   `json:"running"`
	Players int    `json:"players"`
	Battles int    `json:"battles"`
	Combat  string `json:"combat,omitempty"`
}

// StatusSnapshot is the public cluster status payload (no player identities).
type StatusSnapshot struct {
	OK        bool             `json:"ok"`
	Name      string           `json:"name"`
	UptimeSec int64            `json:"uptime_sec"`
	Players   int              `json:"players"`
	Battles   int              `json:"battles"`
	Exp       StatusExpRates   `json:"exp"`
	Maps      []StatusMapEntry `json:"maps"`
}

type statusEnvelope struct {
	Type    string         `json:"type"`
	Payload StatusSnapshot `json:"payload"`
}

func (p *Proxy) buildStatusSnapshot() StatusSnapshot {
	p.mu.Lock()
	nodes := make(map[string]*mapnode.Node, len(p.maps))
	for id, n := range p.maps {
		nodes[id] = n
	}
	specs := append([]cluster.MapSpec(nil), p.cfg.Maps...)
	name := strings.TrimSpace(p.cfg.Proxy.Name)
	exp := p.cfg.Exp
	started := p.startedAt
	p.mu.Unlock()

	if name == "" {
		name = "Clara Mundi"
	}
	out := StatusSnapshot{
		OK:        true,
		Name:      name,
		UptimeSec: int64(time.Since(started).Seconds()),
		Exp: StatusExpRates{
			Rate:        exp.Rate,
			MainPercent: exp.MainPercent,
			SubPercent:  exp.SubPercent,
		},
		Maps: make([]StatusMapEntry, 0, len(specs)),
	}
	for _, spec := range specs {
		entry := StatusMapEntry{
			ID:      spec.ID,
			Name:    spec.Name,
			Enabled: spec.IsEnabled(),
			Running: nodes[spec.ID] != nil,
		}
		if n := nodes[spec.ID]; n != nil {
			players, battles, combat := n.StatusCounts()
			entry.Players = players
			entry.Battles = battles
			entry.Combat = combat
			out.Players += players
			out.Battles += battles
		}
		out.Maps = append(out.Maps, entry)
	}
	return out
}

func (p *Proxy) handleStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(p.buildStatusSnapshot())
}

func (p *Proxy) handleStatusWS(w http.ResponseWriter, r *http.Request) {
	conn, err := statusUpgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Printf("status ws upgrade: %v", err)
		return
	}
	defer conn.Close()

	_ = conn.SetReadDeadline(time.Now().Add(pongWait))
	conn.SetPongHandler(func(string) error {
		_ = conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	writeSnap := func() error {
		_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
		return conn.WriteJSON(statusEnvelope{Type: "status", Payload: p.buildStatusSnapshot()})
	}
	if err := writeSnap(); err != nil {
		return
	}

	ticker := time.NewTicker(statusPushInterval)
	defer ticker.Stop()
	ping := time.NewTicker(pingPeriod)
	defer ping.Stop()

	for {
		select {
		case <-done:
			return
		case <-ticker.C:
			if err := writeSnap(); err != nil {
				return
			}
		case <-ping.C:
			_ = conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

// spaFileServer serves a Vite/React build dir and falls back to index.html for
// client-side routes. API and WebSocket paths must be registered elsewhere.
func spaFileServer(root string) http.Handler {
	fs := http.Dir(root)
	fileServer := http.FileServer(fs)
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		rel := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if rel == "" || rel == "." {
			http.ServeFile(w, r, filepath.Join(root, "index.html"))
			return
		}
		full := filepath.Join(root, filepath.FromSlash(rel))
		if info, err := os.Stat(full); err == nil && !info.IsDir() {
			fileServer.ServeHTTP(w, r)
			return
		}
		if info, err := os.Stat(full); err == nil && info.IsDir() {
			idx := filepath.Join(full, "index.html")
			if _, err := os.Stat(idx); err == nil {
				fileServer.ServeHTTP(w, r)
				return
			}
		}
		http.ServeFile(w, r, filepath.Join(root, "index.html"))
	})
}
