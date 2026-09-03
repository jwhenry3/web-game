package proxy

import (
	"encoding/json"
	"io"
	"net/http"
	"strings"

	"ffv-web-game/internal/game"
)

// AdminContentHandler serves shared Game Designer content catalogs.
type AdminContentHandler struct {
	Maps *AdminMapsHandler
}

func (h *AdminContentHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/admin/content/", h.handleContent)
}

func (h *AdminContentHandler) handleContent(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/admin/content/")
	kind := strings.Trim(rest, "/")
	if kind == "" || strings.Contains(kind, "/") {
		http.NotFound(w, r)
		return
	}
	if !game.ValidContentKind(kind) {
		http.Error(w, "unknown content kind", http.StatusBadRequest)
		return
	}
	switch r.Method {
	case http.MethodGet:
		if !h.Maps.checkAuth(w, r) {
			return
		}
		body, err := game.LoadContent(kind)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		writeAdminJSON(w, map[string]any{
			"kind": kind,
			"data": json.RawMessage(body),
		})
	case http.MethodPut:
		if !h.Maps.checkAuth(w, r) {
			return
		}
		raw, err := io.ReadAll(r.Body)
		if err != nil {
			http.Error(w, "read body", http.StatusBadRequest)
			return
		}
		var envelope struct {
			Data json.RawMessage `json:"data"`
		}
		if err := json.Unmarshal(raw, &envelope); err != nil {
			http.Error(w, "invalid json", http.StatusBadRequest)
			return
		}
		payload := envelope.Data
		if payload == nil {
			payload = raw
		}
		if err := game.SaveContent(kind, payload); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}
