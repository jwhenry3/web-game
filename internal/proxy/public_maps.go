package proxy

import (
	"encoding/json"
	"net/http"
	"strings"

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
	out := make([]protocol.MapSnapshot, 0, len(h.Proxy.maps))
	for _, n := range h.Proxy.maps {
		if snap := n.Hub.MapSnapshot(); snap != nil {
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
	id := strings.TrimPrefix(r.URL.Path, "/maps/")
	id = strings.Trim(id, "/")
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(w, r)
		return
	}
	h.Proxy.mu.Lock()
	n := h.Proxy.maps[id]
	h.Proxy.mu.Unlock()
	if n == nil {
		http.NotFound(w, r)
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
