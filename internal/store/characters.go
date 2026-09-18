package store

import (
	"strings"

	"clara-mundi/internal/game"
)

const MaxCharactersPerAccount = 8

// Get returns a hero profile by name (case-insensitive).
func (s *Store) Get(name string) (Profile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if p, _ := s.profileByNameLocked(name); p != nil {
		return *p, true
	}
	return Profile{}, false
}

// FindByName returns a hero profile by display name (case-insensitive).
func (s *Store) FindByName(name string) (Profile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if p, _ := s.profileByNameLocked(name); p != nil {
		return *p, true
	}
	return Profile{}, false
}

// findProfileLocked resolves a hero name to the live *Profile and its display
// name. Callers hold s.mu (read or write).
func (s *Store) findProfileLocked(name string) (*Profile, string) {
	p, _ := s.profileByNameLocked(name)
	if p == nil {
		return nil, ""
	}
	return p, p.Name
}

// ListByAccount returns all heroes owned by an account.
func (s *Store) ListByAccount(accountID string) []Profile {
	s.mu.RLock()
	defer s.mu.RUnlock()
	out := make([]Profile, 0)
	for _, p := range s.profiles {
		if p.AccountID == accountID {
			out = append(out, *p)
		}
	}
	return out
}

// GetByAccountName returns a hero owned by the given account.
func (s *Store) GetByAccountName(accountID, name string) (Profile, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	if p, _ := s.profileByNameLocked(name); p != nil && p.AccountID == accountID {
		return *p, true
	}
	// Rare fallback: a case-variant duplicate owned by this account that the
	// index does not claim (only creatable via the legacy GetOrCreate path).
	for key, p := range s.profiles {
		if strings.EqualFold(key, name) && p.AccountID == accountID {
			return *p, true
		}
	}
	return Profile{}, false
}

func (s *Store) countByAccountLocked(accountID string) int {
	n := 0
	for _, p := range s.profiles {
		if p.AccountID == accountID {
			n++
		}
	}
	return n
}

// NameTaken reports whether a hero name is already in use.
func (s *Store) NameTaken(name string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.nameTakenLocked(name)
}

// CreateCharacter creates a new hero for an authenticated account.
func (s *Store) CreateCharacter(accountID, name string, race game.RaceID, mainJob, subJob game.JobID, appearance Appearance) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name = strings.TrimSpace(name)
	if name == "" || len(name) > 24 {
		return Profile{}, "Name must be 1-24 characters."
	}
	if s.nameTakenLocked(name) {
		return Profile{}, "That hero name is already taken."
	}
	if s.countByAccountLocked(accountID) >= MaxCharactersPerAccount {
		return Profile{}, "Character limit reached (8 per account)."
	}
	if !game.ValidRace(race) {
		return Profile{}, "Unknown race."
	}
	mainJob = game.JobID(normalizeJobID(string(mainJob)))
	if !game.ValidStartingJob(mainJob) {
		return Profile{}, "Choose a starting job."
	}
	// Sub jobs unlock later via Job Master; creation never equips one.
	subJob = ""

	starter := game.StarterWeaponForJob(mainJob)
	inv := append([]game.Item{starter}, game.StarterConsumables()...)
	inv = append(inv, game.StarterHousingGoods()...)
	jobs := map[string]game.JobProgress{}
	for _, def := range game.AllJobs() {
		jobs[string(def.ID)] = game.JobProgress{Level: 1, XP: 0}
	}
	appearance = NormalizeAppearance(string(race), appearance)
	p := &Profile{
		AccountID:    accountID,
		Name:         name,
		Race:         string(race),
		MainJob:      string(mainJob),
		SubJob:       "",
		UnlockedJobs: startingUnlockedJobs(),
		Appearance:   appearance,
		Jobs:         jobs,
		Loadouts:     map[string]JobLoadout{},
		Inventory:    inv,
		Friends:      []string{},
	}
	p.ensureLoadout()
	p.SyncSkillUnlocks()
	p.syncLegacyLevel()
	s.profiles[name] = p
	s.indexProfileLocked(name, p)
	s.save()
	return *p, ""
}

// GetOrCreate loads a returning player's profile or creates a new one (legacy/tests).
func (s *Store) GetOrCreate(name string, startJob game.JobID) Profile {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		if !game.ValidStartingJob(startJob) {
			startJob = game.JobVAN
		}
		starter := game.StarterWeaponForJob(startJob)
		inv := append([]game.Item{starter}, game.StarterConsumables()...)
		inv = append(inv, game.StarterHousingGoods()...)
		jobs := map[string]game.JobProgress{}
		for _, def := range game.AllJobs() {
			jobs[string(def.ID)] = game.JobProgress{Level: 1, XP: 0}
		}
		p = &Profile{
			Name:         name,
			MainJob:      string(startJob),
			UnlockedJobs: startingUnlockedJobs(),
			Jobs:         jobs,
			Loadouts:     map[string]JobLoadout{},
			Inventory:    inv,
			Friends:      []string{},
		}
		p.ensureLoadout()
		p.SyncSkillUnlocks()
		p.syncLegacyLevel()
		s.profiles[name] = p
		s.indexProfileLocked(name, p)
		s.save()
	}
	return *p
}

// DeleteCharacter removes a hero owned by the account.
func (s *Store) DeleteCharacter(accountID, name string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	name = strings.TrimSpace(name)
	p, key := s.profileByNameLocked(name)
	if p == nil {
		return "Character not found."
	}
	if p.AccountID != accountID {
		return "Character belongs to another account."
	}
	delete(s.profiles, key)
	s.unindexProfileLocked(key)
	s.save()
	return ""
}
