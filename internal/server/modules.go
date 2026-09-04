package server

import (
	"encoding/json"
	"net/http"

	"clara-mundi/internal/plugins"
)

// ModulesHandler serves the enabled plugin manifest for the web client.
func ModulesHandler(cfg plugins.Config) http.HandlerFunc {
	manifest := cfg.ClientManifest()
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodGet {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(manifest)
	}
}
