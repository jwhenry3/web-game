package proxy

import (
	"net/http"
	"strings"

	"clara-mundi/internal/game"
)

// PublicContentHandler serves read-only content catalogs that game clients
// need without admin auth (e.g. the shared character/appearance catalog).
// Admin writes go through AdminContentHandler; this exposes GETs only for
// kinds listed in publicContentKinds.
type PublicContentHandler struct{}

var publicContentKinds = map[string]bool{
	"characters": true,
}

func (h *PublicContentHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/content/", h.handleContent)
}

func (h *PublicContentHandler) handleContent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	kind := strings.Trim(strings.TrimPrefix(r.URL.Path, "/content/"), "/")
	if kind == "" || strings.Contains(kind, "/") || !publicContentKinds[kind] {
		http.NotFound(w, r)
		return
	}
	raw, err := game.LoadContent(kind)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	_, _ = w.Write(raw)
}
