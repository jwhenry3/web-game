package server

import (
	"encoding/json"
	"net/http"
	"net/url"
	"strings"

	"ffv-web-game/internal/auth"
	"ffv-web-game/internal/store"
)

type CharacterKicker interface {
	KickByCharacterName(name string)
}

type AuthHandler struct {
	accounts *store.AccountStore
	profiles *store.Store
	tokens   *auth.TokenIssuer
	hub      CharacterKicker
}

func NewAuthHandler(accounts *store.AccountStore, profiles *store.Store, tokens *auth.TokenIssuer, hub CharacterKicker) *AuthHandler {
	return &AuthHandler{accounts: accounts, profiles: profiles, tokens: tokens, hub: hub}
}

type authRequest struct {
	Username string `json:"username"`
	Password string `json:"password"`
}

type characterSummary struct {
	Name    string `json:"name"`
	Race    string `json:"race"`
	MainJob string `json:"main_job"`
	SubJob  string `json:"sub_job"`
}

type authResponse struct {
	Token        string             `json:"token"`
	Username     string             `json:"username"`
	HasCharacter bool               `json:"has_character"`
	IsAdmin      bool               `json:"is_admin"`
	Characters   []characterSummary `json:"characters"`
	Character    *characterSummary  `json:"character,omitempty"` // legacy: first character
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request."})
		return
	}
	account, err := h.accounts.Register(req.Username, req.Password)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": authErrorMessage(err)})
		return
	}
	token, err := h.tokens.Issue(account.ID, account.Username)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Could not issue token."})
		return
	}
	chars := h.charactersForAccount(account.ID)
	writeJSON(w, http.StatusOK, authResponse{
		Token:        token,
		Username:     account.Username,
		HasCharacter: len(chars) > 0,
		IsAdmin:      account.IsAdmin,
		Characters:   chars,
	})
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}
	var req authRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request."})
		return
	}
	account, err := h.accounts.Login(req.Username, req.Password)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid username or password."})
		return
	}
	token, err := h.tokens.Issue(account.ID, account.Username)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "Could not issue token."})
		return
	}
	chars := h.charactersForAccount(account.ID)
	resp := authResponse{
		Token:        token,
		Username:     account.Username,
		HasCharacter: len(chars) > 0,
		IsAdmin:      account.IsAdmin,
		Characters:   chars,
	}
	if len(chars) > 0 {
		resp.Character = &chars[0]
	}
	writeJSON(w, http.StatusOK, resp)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h.meGet(w, r)
	case http.MethodPost:
		h.mePost(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed."})
	}
}

func (h *AuthHandler) meGet(w http.ResponseWriter, r *http.Request) {
	token := bearerToken(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Missing token."})
		return
	}
	claims, err := h.tokens.Parse(token)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid token."})
		return
	}
	account, ok := h.accounts.Get(claims.AccountID)
	if !ok {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Account not found."})
		return
	}
	chars := h.charactersForAccount(account.ID)
	resp := authResponse{
		Username:     account.Username,
		HasCharacter: len(chars) > 0,
		IsAdmin:      account.IsAdmin,
		Characters:   chars,
	}
	if len(chars) > 0 {
		resp.Character = &chars[0]
	}
	writeJSON(w, http.StatusOK, resp)
}

type meActionRequest struct {
	Action string `json:"action"`
	Name   string `json:"name"`
}

func (h *AuthHandler) mePost(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.authenticatedClaims(w, r)
	if !ok {
		return
	}
	var req meActionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request."})
		return
	}
	switch req.Action {
	case "delete_character":
		h.finishDeleteCharacter(w, claims.AccountID, strings.TrimSpace(req.Name))
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Unknown action."})
	}
}

type deleteCharacterRequest struct {
	Name string `json:"name"`
}

func (h *AuthHandler) DeleteCharacter(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodPost:
		h.deleteCharacterPost(w, r)
	case http.MethodDelete:
		h.deleteCharacterDelete(w, r)
	default:
		writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "Method not allowed."})
	}
}

func (h *AuthHandler) deleteCharacterPost(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.authenticatedClaims(w, r)
	if !ok {
		return
	}
	var req deleteCharacterRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid request."})
		return
	}
	h.finishDeleteCharacter(w, claims.AccountID, strings.TrimSpace(req.Name))
}

func (h *AuthHandler) deleteCharacterDelete(w http.ResponseWriter, r *http.Request) {
	claims, ok := h.authenticatedClaims(w, r)
	if !ok {
		return
	}
	name := strings.TrimSpace(r.URL.Query().Get("name"))
	if name == "" {
		path := strings.TrimPrefix(r.URL.Path, "/characters/")
		if path == r.URL.Path {
			path = strings.TrimPrefix(r.URL.Path, "/api/characters/")
		}
		decoded, err := url.PathUnescape(strings.TrimSpace(path))
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Invalid character name."})
			return
		}
		name = decoded
	}
	h.finishDeleteCharacter(w, claims.AccountID, name)
}

func (h *AuthHandler) finishDeleteCharacter(w http.ResponseWriter, accountID, name string) {
	if name == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "Character name required."})
		return
	}
	if errMsg := h.profiles.DeleteCharacter(accountID, name); errMsg != "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": errMsg})
		return
	}
	if h.hub != nil {
		h.hub.KickByCharacterName(name)
	}
	chars := h.charactersForAccount(accountID)
	writeJSON(w, http.StatusOK, map[string]any{
		"characters":    chars,
		"has_character": len(chars) > 0,
	})
}

func (h *AuthHandler) authenticatedClaims(w http.ResponseWriter, r *http.Request) (auth.Claims, bool) {
	token := bearerToken(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Missing token."})
		return auth.Claims{}, false
	}
	claims, err := h.tokens.Parse(token)
	if err != nil {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "Invalid token."})
		return auth.Claims{}, false
	}
	return claims, true
}

func (h *AuthHandler) charactersForAccount(accountID string) []characterSummary {
	profiles := h.profiles.ListByAccount(accountID)
	out := make([]characterSummary, 0, len(profiles))
	for _, p := range profiles {
		out = append(out, characterSummary{
			Name: p.Name, Race: p.Race, MainJob: p.MainJob, SubJob: p.SubJob,
		})
	}
	return out
}

func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if strings.HasPrefix(h, "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return r.URL.Query().Get("token")
}

func authErrorMessage(err error) string {
	switch err {
	case store.ErrAccountExists:
		return "Username already taken."
	case store.ErrWeakPassword:
		return "Password must be at least 6 characters."
	case store.ErrInvalidUsername:
		return "Username must be 3-20 characters."
	default:
		return err.Error()
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}
