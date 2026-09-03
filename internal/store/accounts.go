package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"golang.org/x/crypto/bcrypt"
)

var (
	ErrAccountExists   = errors.New("username already taken")
	ErrInvalidLogin    = errors.New("invalid username or password")
	ErrWeakPassword    = errors.New("password must be at least 6 characters")
	ErrInvalidUsername = errors.New("username must be 3-20 characters")
)

type Account struct {
	ID            string `json:"id"`
	Username      string `json:"username"`
	PasswordHash  string `json:"password_hash"`
	CharacterName string `json:"character_name,omitempty"`
	IsAdmin       bool   `json:"is_admin,omitempty"`
}

type AccountStore struct {
	mu       sync.Mutex
	path     string
	accounts map[string]*Account // id -> account
	byName   map[string]string   // lowercase username -> id
}

func LoadAccounts(path string) *AccountStore {
	s := &AccountStore{
		path:     path,
		accounts: map[string]*Account{},
		byName:   map[string]string{},
	}
	data, err := os.ReadFile(path)
	if err == nil {
		var list []Account
		if err := json.Unmarshal(data, &list); err != nil {
			log.Printf("store: could not parse %s, starting fresh: %v", path, err)
		} else {
			for i := range list {
				a := list[i]
				s.accounts[a.ID] = &a
				s.byName[strings.ToLower(a.Username)] = a.ID
			}
		}
	}
	return s
}

func newAccountID() string {
	b := make([]byte, 8)
	if _, err := rand.Read(b); err != nil {
		return "acc-fallback"
	}
	return "acc-" + hex.EncodeToString(b)
}

func (s *AccountStore) Register(username, password string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	username = strings.TrimSpace(username)
	if len(username) < 3 || len(username) > 20 {
		return Account{}, ErrInvalidUsername
	}
	if len(password) < 6 {
		return Account{}, ErrWeakPassword
	}
	if _, ok := s.byName[strings.ToLower(username)]; ok {
		return Account{}, ErrAccountExists
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return Account{}, err
	}
	a := &Account{
		ID:           newAccountID(),
		Username:     username,
		PasswordHash: string(hash),
	}
	s.accounts[a.ID] = a
	s.byName[strings.ToLower(username)] = a.ID
	s.save()
	return *a, nil
}

func (s *AccountStore) Login(username, password string) (Account, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, ok := s.byName[strings.ToLower(strings.TrimSpace(username))]
	if !ok {
		return Account{}, ErrInvalidLogin
	}
	a := s.accounts[id]
	if err := bcrypt.CompareHashAndPassword([]byte(a.PasswordHash), []byte(password)); err != nil {
		return Account{}, ErrInvalidLogin
	}
	return *a, nil
}

// EnsureDefaultAdmin creates the default admin/admin account if missing.
func (s *AccountStore) EnsureDefaultAdmin() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.byName["admin"]; ok {
		if a := s.accounts[s.byName["admin"]]; a != nil && !a.IsAdmin {
			a.IsAdmin = true
			s.save()
		}
		return
	}
	hash, err := bcrypt.GenerateFromPassword([]byte("admin"), bcrypt.DefaultCost)
	if err != nil {
		log.Printf("store: default admin hash error: %v", err)
		return
	}
	a := &Account{
		ID:           "acc-admin",
		Username:     "admin",
		PasswordHash: string(hash),
		IsAdmin:      true,
	}
	s.accounts[a.ID] = a
	s.byName["admin"] = a.ID
	s.save()
	log.Printf("store: created default admin account (username: admin, password: admin)")
}

func (s *AccountStore) IsAdmin(accountID string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.accounts[accountID]
	return ok && a.IsAdmin
}

func (s *AccountStore) Get(id string) (Account, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.accounts[id]
	if !ok {
		return Account{}, false
	}
	return *a, true
}

func (s *AccountStore) SetCharacterName(accountID, name string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	a, ok := s.accounts[accountID]
	if !ok {
		return false
	}
	a.CharacterName = name
	s.save()
	return true
}

func (s *AccountStore) save() {
	if s.path == "" {
		return
	}
	list := make([]Account, 0, len(s.accounts))
	for _, a := range s.accounts {
		list = append(list, *a)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		log.Printf("store: marshal accounts error: %v", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		log.Printf("store: mkdir accounts error: %v", err)
		return
	}
	if err := os.WriteFile(s.path, data, 0o644); err != nil {
		log.Printf("store: write accounts error: %v", err)
	}
}
