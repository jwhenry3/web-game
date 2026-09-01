package store

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"ffv-web-game/internal/game"
)

// Store is the persistence layer for player profiles: per-job levels, combo
// loadouts (gear/skills/hotbar), and shared inventory.

// HotbarBinding assigns a skill or consumable type to a quick-use slot.
type HotbarBinding struct {
	Kind string `json:"kind"` // "skill" | "item"
	ID   string `json:"id"`   // skill id or consumable def id
}

const MaxCharactersPerAccount = 8

type Profile struct {
	AccountID  string                       `json:"account_id,omitempty"`
	Name       string                       `json:"name"`
	Race       string                       `json:"race,omitempty"`
	MainJob    string                       `json:"main_job"`
	SubJob     string                       `json:"sub_job"`
	Appearance Appearance                   `json:"appearance,omitempty"`
	Jobs       map[string]game.JobProgress  `json:"jobs"`
	Loadouts  map[string]JobLoadout        `json:"loadouts"`
	Inventory []game.Item                  `json:"inventory"`
	Friends   []string                     `json:"friends"`

	// Legacy fields migrated into Jobs/Loadouts on load.
	Level          int                      `json:"level,omitempty"`
	XP             int                      `json:"xp,omitempty"`
	Proficiency    map[string]int           `json:"proficiency,omitempty"`
	UnlockedSkills []string                 `json:"unlocked_skills,omitempty"`
	Equipped       map[string]string        `json:"equipped,omitempty"`
	Hotbar         map[string]HotbarBinding `json:"hotbar,omitempty"`
}

type Store struct {
	mu       sync.Mutex
	path     string
	profiles map[string]*Profile
}

func Load(path string) *Store {
	s := &Store{path: path, profiles: map[string]*Profile{}}
	data, err := os.ReadFile(path)
	if err == nil {
		if err := json.Unmarshal(data, &s.profiles); err != nil {
			log.Printf("store: could not parse %s, starting fresh: %v", path, err)
			s.profiles = map[string]*Profile{}
		}
	}
	for _, p := range s.profiles {
		if p.Inventory == nil {
			p.Inventory = []game.Item{}
		}
		if p.Friends == nil {
			p.Friends = []string{}
		}
		for i := range p.Inventory {
			if p.Inventory[i].Kind == "" {
				p.Inventory[i].Kind = game.KindEquipment
			}
		}
		p.Inventory = game.CompactStacks(p.Inventory)
		p.migrateJobs()
	}
	return s
}

// ListByAccount returns all heroes owned by an account.
func (s *Store) ListByAccount(accountID string) []Profile {
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.Lock()
	defer s.mu.Unlock()
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
	s.mu.Lock()
	defer s.mu.Unlock()
	for key := range s.profiles {
		if strings.EqualFold(key, name) {
			return true
		}
	}
	return false
}

// CreateCharacter creates a new hero for an authenticated account.
func (s *Store) CreateCharacter(accountID, name string, race game.RaceID, mainJob, subJob game.JobID, appearance Appearance) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	name = strings.TrimSpace(name)
	if name == "" || len(name) > 24 {
		return Profile{}, "Name must be 1-24 characters."
	}
	for key := range s.profiles {
		if strings.EqualFold(key, name) {
			return Profile{}, "That hero name is already taken."
		}
	}
	if s.countByAccountLocked(accountID) >= MaxCharactersPerAccount {
		return Profile{}, "Character limit reached (8 per account)."
	}
	if !game.ValidRace(race) {
		return Profile{}, "Unknown race."
	}
	mainJob = game.JobID(normalizeJobID(string(mainJob)))
	if !game.ValidJob(mainJob) {
		return Profile{}, "Unknown main job."
	}
	subJob = game.JobID(normalizeJobID(string(subJob)))
	if subJob != "" {
		if !game.ValidJob(subJob) {
			return Profile{}, "Unknown sub job."
		}
		if subJob == mainJob {
			return Profile{}, "Sub job must differ from main job."
		}
	}

	starter := game.StarterWeaponForJob(mainJob)
	inv := append([]game.Item{starter}, game.StarterConsumables()...)
	if subJob != "" {
		subStarter := game.StarterWeaponForJob(subJob)
		subStarter.ID = "starter-" + strings.ToLower(string(subJob)) + "-" + string(subStarter.Type)
		inv = append(inv, subStarter)
	}
	jobs := map[string]game.JobProgress{}
	for _, def := range game.AllJobs() {
		jobs[string(def.ID)] = game.JobProgress{Level: 1, XP: 0}
	}
	appearance = NormalizeAppearance(string(race), appearance)
	p := &Profile{
		AccountID:  accountID,
		Name:       name,
		Race:       string(race),
		MainJob:    string(mainJob),
		SubJob:     string(subJob),
		Appearance: appearance,
		Jobs:       jobs,
		Loadouts:   map[string]JobLoadout{},
		Inventory:  inv,
		Friends:    []string{},
	}
	p.ensureLoadout()
	p.SyncSkillUnlocks()
	p.syncLegacyLevel()
	s.profiles[name] = p
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
			startJob = game.JobWAR
		}
		starter := game.StarterWeaponForJob(startJob)
		inv := append([]game.Item{starter}, game.StarterConsumables()...)
		jobs := map[string]game.JobProgress{}
		for _, def := range game.AllJobs() {
			jobs[string(def.ID)] = game.JobProgress{Level: 1, XP: 0}
		}
		p = &Profile{
			Name:      name,
			MainJob:   string(startJob),
			Jobs:      jobs,
			Loadouts:  map[string]JobLoadout{},
			Inventory: inv,
			Friends:   []string{},
		}
		p.ensureLoadout()
		p.SyncSkillUnlocks()
		p.syncLegacyLevel()
		s.profiles[name] = p
		s.save()
	}
	return *p
}

// SetJobs switches main/sub jobs (out of combat). Returns an error message when invalid.
func (s *Store) SetJobs(name string, mainJob, subJob game.JobID) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Unknown hero."
	}
	mainJob = game.JobID(normalizeJobID(string(mainJob)))
	if !game.ValidJob(mainJob) {
		return *p, "Unknown main job."
	}
	subJob = game.JobID(normalizeJobID(string(subJob)))
	if subJob != "" {
		if !game.ValidJob(subJob) {
			return *p, "Unknown sub job."
		}
		if subJob == mainJob {
			return *p, "Sub job must differ from main job."
		}
		if p.JobLevel(mainJob) < game.SubjobUnlockLevel {
			return *p, "Sub job unlocks at main job level 5."
		}
	}
	p.MainJob = string(mainJob)
	p.SubJob = string(subJob)
	p.grantJobWeaponIfMissing(mainJob)
	if subJob != "" {
		p.grantJobWeaponIfMissing(subJob)
	}
	p.ensureLoadout()
	p.SyncSkillUnlocks()
	p.syncLegacyLevel()
	s.save()
	return *p, ""
}

// UpgradeSkill removed — skills level through battle use only.

// UnlockSkill forces a skill to level 1 (tests).
func (s *Store) UnlockSkill(name, skillID string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Unknown hero."
	}
	if _, ok := game.FindSkill(skillID); !ok {
		return *p, "Unknown skill."
	}
	l := p.ActiveLoadout()
	l.SkillLevels[skillID] = 1
	p.Loadouts[p.ComboKey()] = *l
	s.save()
	return *p, ""
}

func (s *Store) AddFriend(name, friendName string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Unknown hero."
	}
	friendName = strings.TrimSpace(friendName)
	if friendName == "" {
		return *p, "Enter a hero name."
	}
	if strings.EqualFold(friendName, name) {
		return *p, "You cannot friend yourself."
	}
	for _, f := range p.Friends {
		if strings.EqualFold(f, friendName) {
			return *p, "Already on your friend list."
		}
	}
	if len(p.Friends) >= 50 {
		return *p, "Friend list is full."
	}
	p.Friends = append(p.Friends, friendName)
	s.save()
	return *p, ""
}

func (s *Store) RemoveFriend(name, friendName string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	for i, f := range p.Friends {
		if strings.EqualFold(f, friendName) {
			p.Friends = append(p.Friends[:i], p.Friends[i+1:]...)
			s.save()
			return *p, true
		}
	}
	return *p, false
}

func (s *Store) FindItem(name, itemID string) (game.Item, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return game.Item{}, false
	}
	for _, item := range p.Inventory {
		if item.ID == itemID {
			return item, true
		}
	}
	return game.Item{}, false
}

func (s *Store) UseConsumable(name, itemID string) (game.Item, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return game.Item{}, false
	}
	for i, item := range p.Inventory {
		if item.ID == itemID && item.Kind == game.KindConsumable {
			used := item
			used.Qty = 1
			if game.ItemQty(item) <= 1 {
				p.Inventory = append(p.Inventory[:i], p.Inventory[i+1:]...)
			} else {
				p.Inventory[i].Qty = game.ItemQty(item) - 1
			}
			s.save()
			return used, true
		}
	}
	return game.Item{}, false
}

func (s *Store) SetHotbar(name, slot, kind, id string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	valid := map[string]bool{"1": true, "2": true, "3": true, "4": true, "5": true}
	if !valid[slot] {
		return *p, false
	}
	l := p.ActiveLoadout()
	if kind == "" {
		delete(l.Hotbar, slot)
	} else {
		l.Hotbar[slot] = HotbarBinding{Kind: kind, ID: id}
	}
	p.Loadouts[p.ComboKey()] = *l
	s.save()
	return *p, true
}

func (s *Store) Equip(name, itemID, equipSlot string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	for _, item := range p.Inventory {
		if item.ID != itemID {
			continue
		}
		if item.Kind != game.KindEquipment {
			return Profile{}, false
		}
		l := p.ActiveLoadout()
		targetSlot := equipSlot
		if item.Slot == game.SlotWeapon {
			if targetSlot == "" {
				targetSlot = game.SlotWeapon
			}
			if targetSlot != game.SlotWeapon && targetSlot != game.SlotSubWeapon {
				return Profile{}, false
			}
			var allowed game.WeaponType
			switch targetSlot {
			case game.SlotSubWeapon:
				if p.SubJob == "" {
					return Profile{}, false
				}
				allowed = game.JobWeapon(game.JobID(p.SubJob))
			default:
				allowed = game.JobWeapon(game.JobID(p.MainJob))
			}
			if game.WeaponType(item.Type) != allowed {
				return Profile{}, false
			}
		} else {
			targetSlot = item.Slot
		}
		if !game.ValidEquipSlot(targetSlot) {
			return Profile{}, false
		}
		l.Equipped[targetSlot] = item.ID
		p.Loadouts[p.ComboKey()] = *l
		s.save()
		return *p, true
	}
	return Profile{}, false
}

func (s *Store) Unequip(name, slot string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	if !game.ValidEquipSlot(slot) {
		return Profile{}, false
	}
	l := p.ActiveLoadout()
	delete(l.Equipped, slot)
	p.Loadouts[p.ComboKey()] = *l
	s.save()
	return *p, true
}

// AddBattleTraining records per-skill usage for the active combo.
func (s *Store) AddBattleTraining(name string, skillUsage map[string]int) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	l := p.ActiveLoadout()
	changed := false
	for skillID, uses := range skillUsage {
		if uses > 0 {
			applySkillUsage(l, skillID, uses)
			changed = true
		}
	}
	if changed {
		p.Loadouts[p.ComboKey()] = *l
		s.save()
	}
	return *p, true
}

// AwardJobVictory grants XP to main and sub jobs, loot to inventory.
func (s *Store) AwardJobVictory(name string, mainXP, subXP int, loot []game.Item) (Profile, int, int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, 0, 0
	}
	mainLevels := 0
	if prog, ok := p.Jobs[p.MainJob]; ok {
		mainLevels = awardXP(&prog, mainXP)
		p.Jobs[p.MainJob] = prog
	}
	subLevels := 0
	if p.SubJob != "" && subXP > 0 {
		if prog, ok := p.Jobs[p.SubJob]; ok {
			subLevels = awardXP(&prog, subXP)
			p.Jobs[p.SubJob] = prog
		}
	}
	p.SyncSkillUnlocks()
	p.syncLegacyLevel()
	p.Inventory = game.AddItems(p.Inventory, loot)
	s.save()
	return *p, mainLevels, subLevels
}

// AwardVictory applies XP to the legacy single level (tests).
func (s *Store) AwardVictory(name string, xp int, loot []game.Item) (Profile, int) {
	p, levels, _ := s.AwardJobVictory(name, xp, 0, loot)
	return p, levels
}

func (s *Store) Get(name string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for key, p := range s.profiles {
		if strings.EqualFold(key, name) {
			return *p, true
		}
	}
	return Profile{}, false
}

// DeleteCharacter removes a hero owned by the account.
func (s *Store) DeleteCharacter(accountID, name string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	name = strings.TrimSpace(name)
	var keyToDelete string
	for key, p := range s.profiles {
		if strings.EqualFold(key, name) {
			if p.AccountID != accountID {
				return "Character belongs to another account."
			}
			keyToDelete = key
			break
		}
	}
	if keyToDelete == "" {
		return "Character not found."
	}
	delete(s.profiles, keyToDelete)
	s.save()
	return ""
}

func (s *Store) save() {
	if s.path == "" {
		return
	}
	data, err := json.MarshalIndent(s.profiles, "", "  ")
	if err != nil {
		log.Printf("store: marshal error: %v", err)
		return
	}
	if err := os.MkdirAll(filepath.Dir(s.path), 0o755); err != nil {
		log.Printf("store: mkdir error: %v", err)
		return
	}
	if err := os.WriteFile(s.path, data, 0o644); err != nil {
		log.Printf("store: write error: %v", err)
	}
}
