package proxy

import (
	"encoding/json"
	"net/http"
	"strings"

	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

// PublicMapsHandler serves read-only map configuration for game clients.
type PublicMapsHandler struct {
	Proxy *Proxy
}

func (h *PublicMapsHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/maps", h.handleMaps)
	mux.HandleFunc("/maps/", h.handleMapByID)
}

func (h *PublicMapsHandler) handleMaps(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path != "/maps" {
		h.handleMapByID(w, r)
		return
	}
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	h.Proxy.mu.Lock()
	out := make([]protocol.MapSnapshot, 0, len(h.Proxy.maps)+1)
	for _, n := range h.Proxy.maps {
		if snap := n.Hub.MapSnapshot(); snap != nil {
			out = append(out, *snap)
		}
	}
	// In singular-world mode the world node is the only running map server.
	if h.Proxy.world != nil {
		if snap := h.Proxy.world.Hub.MapSnapshot(); snap != nil {
			out = append(out, *snap)
		}
	}
	h.Proxy.mu.Unlock()
	writePublicJSON(w, out)
}

func (h *PublicMapsHandler) handleMapByID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	parts := strings.Split(strings.Trim(strings.TrimPrefix(r.URL.Path, "/maps/"), "/"), "/")
	if parts[0] == "" || len(parts) > 2 {
		http.NotFound(w, r)
		return
	}
	id := parts[0]
	h.Proxy.mu.Lock()
	n := h.Proxy.maps[id]
	if n == nil && h.Proxy.world != nil && h.Proxy.world.Spec.ID == id {
		n = h.Proxy.world
	}
	h.Proxy.mu.Unlock()
	if n == nil {
		http.NotFound(w, r)
		return
	}
	if len(parts) == 2 {
		if parts[1] != "scene3d" {
			http.NotFound(w, r)
			return
		}
		// The editor loads the authored 3D layer through the public route; an
		// unauthored map answers an empty document rather than 404.
		scene := game.EmptyScene3D(id)
		if n.OW != nil && n.OW.Scene3D != nil {
			scene = n.OW.Scene3D
		}
		writePublicJSON(w, scene)
		return
	}
	snap := n.Hub.MapSnapshot()
	if snap == nil {
		http.Error(w, "map unavailable", http.StatusServiceUnavailable)
		return
	}
	writePublicJSON(w, snap)
}

func writePublicJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}
