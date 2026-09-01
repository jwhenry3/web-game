package server

import "net/http"

// RegisterAPIRoutes mounts JSON API handlers under /api (use with StripPrefix).
func RegisterAPIRoutes(mux *http.ServeMux, auth *AuthHandler) {
	mux.HandleFunc("/register", auth.Register)
	mux.HandleFunc("/login", auth.Login)
	mux.HandleFunc("/me", auth.Me)
	mux.HandleFunc("/delete-character", auth.DeleteCharacter)
	// Legacy delete paths (older clients).
	mux.HandleFunc("/characters/delete", auth.DeleteCharacter)
	mux.HandleFunc("/characters/", auth.DeleteCharacter)
}
