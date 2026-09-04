package store

import (
	"encoding/json"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"

	"clara-mundi/internal/game"
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
	AccountID         string                      `json:"account_id,omitempty"`
	Name              string                      `json:"name"`
	Race              string                      `json:"race,omitempty"`
	MainJob           string                      `json:"main_job"`
	SubJob            string                      `json:"sub_job"`
	UnlockedJobs      []string                    `json:"unlocked_jobs,omitempty"`
	Appearance        Appearance                  `json:"appearance,omitempty"`
	Jobs              map[string]game.JobProgress `json:"jobs"`
	Loadouts          map[string]JobLoadout       `json:"loadouts"`
	Inventory         []game.Item                 `json:"inventory"`
	// HouseStorage is separate from inventory; only accessible inside an active camp house.
	HouseStorage []game.Item `json:"house_storage,omitempty"`
	// HouseFurniture persists decorations placed inside the house.
	HouseFurniture []game.HouseFurniture `json:"house_furniture,omitempty"`
	// CampSkin is the overworld tent graphic (see game.CampSkins).
	CampSkin string `json:"camp_skin,omitempty"`
	// Pets is the captured companion collection.
	Pets []game.PetRecord `json:"pets,omitempty"`
	// FollowPetID is the pet that follows on the overworld (empty = none).
	FollowPetID string `json:"follow_pet_id,omitempty"`
	// BattlePetID is the pet that joins as a battle ally (empty = none).
	BattlePetID string `json:"battle_pet_id,omitempty"`
	Friends                  []string `json:"friends"`
	IncomingFriendRequests   []string `json:"incoming_friend_requests,omitempty"`
	OutgoingFriendRequests   []string `json:"outgoing_friend_requests,omitempty"`
	Keybinds                 map[string]string `json:"keybinds,omitempty"`
	SavePointID       string                      `json:"save_point_id,omitempty"`
	VisitedSavePoints []string                    `json:"visited_save_points,omitempty"`
	MapID             string                      `json:"map_id,omitempty"`
	PrevMapID         string                      `json:"pdnc_map_id,omitempty"`
	WorldX            float64                     `json:"world_x,omitempty"`
	WorldY            float64                     `json:"world_y,omitempty"`
	Facing            string                      `json:"facing,omitempty"`
	HasWorldPos       bool                        `json:"has_world_pos,omitempty"`

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
		if p.HouseStorage == nil {
			p.HouseStorage = []game.Item{}
		}
		if p.HouseFurniture == nil {
			p.HouseFurniture = []game.HouseFurniture{}
		}
		p.CampSkin = game.NormalizeCampSkin(p.CampSkin)
		p.HouseStorage = game.CompactStacks(p.HouseStorage)
		if p.Friends == nil {
			p.Friends = []string{}
		}
		if p.IncomingFriendRequests == nil {
			p.IncomingFriendRequests = []string{}
		}
		if p.OutgoingFriendRequests == nil {
			p.OutgoingFriendRequests = []string{}
		}
		if p.Keybinds == nil {
			p.Keybinds = map[string]string{}
		}
		for i := range p.Inventory {
			if p.Inventory[i].Kind == "" {
				p.Inventory[i].Kind = game.KindEquipment
			}
		}
		p.Inventory = game.CompactStacks(p.Inventory)
		p.VisitedSavePoints = addVisited(p.VisitedSavePoints, p.SavePointID)
		p.migrateClaraMundiIDs()
		p.migrateJobs()
		p.ensureUnlockedJobs()
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
	p.ensureUnlockedJobs()
	mainJob = game.JobID(normalizeJobID(string(mainJob)))
	if !game.ValidJob(mainJob) {
		return *p, "Unknown main job."
	}
	if !p.HasUnlockedJob(mainJob) {
		return *p, "You have not unlocked that job yet."
	}
	subJob = game.JobID(normalizeJobID(string(subJob)))
	if subJob != "" {
		if !game.ValidJob(subJob) {
			return *p, "Unknown sub job."
		}
		if subJob == mainJob {
			return *p, "Sub job must differ from main job."
		}
		if !p.HasUnlockedJob(subJob) {
			return *p, "You have not unlocked that job yet."
		}
		need := game.CurrentSubjobUnlockLevel()
		if p.JobLevel(mainJob) < need {
			return *p, fmt.Sprintf("Sub job unlocks at main job level %d.", need)
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

func friendListHas(list []string, name string) bool {
	for _, n := range list {
		if strings.EqualFold(n, name) {
			return true
		}
	}
	return false
}

func friendListRemove(list []string, name string) []string {
	out := make([]string, 0, len(list))
	for _, n := range list {
		if !strings.EqualFold(n, name) {
			out = append(out, n)
		}
	}
	return out
}

// FindByName returns a hero profile by display name (case-insensitive).
func (s *Store) FindByName(name string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, p := range s.profiles {
		if strings.EqualFold(p.Name, name) {
			return *p, true
		}
	}
	return Profile{}, false
}

func (s *Store) findProfileLocked(name string) (*Profile, string) {
	for _, p := range s.profiles {
		if strings.EqualFold(p.Name, name) {
			return p, p.Name
		}
	}
	return nil, ""
}

func (s *Store) linkFriendsLocked(a, b *Profile) string {
	if len(a.Friends) >= 50 {
		return "Your friend list is full."
	}
	if len(b.Friends) >= 50 {
		return a.Name + "'s friend list is full."
	}
	if !friendListHas(a.Friends, b.Name) {
		a.Friends = append(a.Friends, b.Name)
	}
	if !friendListHas(b.Friends, a.Name) {
		b.Friends = append(b.Friends, a.Name)
	}
	a.IncomingFriendRequests = friendListRemove(a.IncomingFriendRequests, b.Name)
	a.OutgoingFriendRequests = friendListRemove(a.OutgoingFriendRequests, b.Name)
	b.IncomingFriendRequests = friendListRemove(b.IncomingFriendRequests, a.Name)
	b.OutgoingFriendRequests = friendListRemove(b.OutgoingFriendRequests, a.Name)
	return ""
}

// SendFriendRequest queues an incoming request for the target hero.
func (s *Store) SendFriendRequest(fromName, toName string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	from, _ := s.findProfileLocked(fromName)
	if from == nil {
		return Profile{}, "Unknown hero."
	}
	toName = strings.TrimSpace(toName)
	if toName == "" {
		return *from, "Enter a hero name."
	}
	if strings.EqualFold(toName, from.Name) {
		return *from, "You cannot friend yourself."
	}
	to, _ := s.findProfileLocked(toName)
	if to == nil {
		return *from, "No hero with that name exists."
	}
	if friendListHas(from.Friends, to.Name) {
		return *from, "Already on your friend list."
	}
	if friendListHas(from.OutgoingFriendRequests, to.Name) {
		return *from, "Friend request already sent."
	}
	if friendListHas(from.IncomingFriendRequests, to.Name) {
		if msg := s.linkFriendsLocked(from, to); msg != "" {
			return *from, msg
		}
		s.save()
		return *from, ""
	}
	if friendListHas(to.IncomingFriendRequests, from.Name) {
		return *from, "They already have your pending request."
	}
	to.IncomingFriendRequests = append(to.IncomingFriendRequests, from.Name)
	from.OutgoingFriendRequests = append(from.OutgoingFriendRequests, to.Name)
	s.save()
	return *from, ""
}

// AcceptFriendRequest adds both heroes as friends and clears pending requests.
func (s *Store) AcceptFriendRequest(accepterName, fromName string) (Profile, Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	accepter, _ := s.findProfileLocked(accepterName)
	if accepter == nil {
		return Profile{}, Profile{}, "Unknown hero."
	}
	fromName = strings.TrimSpace(fromName)
	if fromName == "" {
		return *accepter, Profile{}, "Enter a hero name."
	}
	if !friendListHas(accepter.IncomingFriendRequests, fromName) {
		return *accepter, Profile{}, "No friend request from that hero."
	}
	other, _ := s.findProfileLocked(fromName)
	if other == nil {
		accepter.IncomingFriendRequests = friendListRemove(accepter.IncomingFriendRequests, fromName)
		s.save()
		return *accepter, Profile{}, "That hero no longer exists."
	}
	if msg := s.linkFriendsLocked(accepter, other); msg != "" {
		return *accepter, Profile{}, msg
	}
	s.save()
	return *accepter, *other, ""
}

// DeclineFriendRequest removes a pending friend request.
func (s *Store) DeclineFriendRequest(declinerName, fromName string) (Profile, Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	decliner, _ := s.findProfileLocked(declinerName)
	if decliner == nil {
		return Profile{}, Profile{}, false
	}
	fromName = strings.TrimSpace(fromName)
	if fromName == "" || !friendListHas(decliner.IncomingFriendRequests, fromName) {
		return *decliner, Profile{}, false
	}
	decliner.IncomingFriendRequests = friendListRemove(decliner.IncomingFriendRequests, fromName)
	var other *Profile
	if p, _ := s.findProfileLocked(fromName); p != nil {
		other = p
		other.OutgoingFriendRequests = friendListRemove(other.OutgoingFriendRequests, decliner.Name)
	}
	s.save()
	if other != nil {
		return *decliner, *other, true
	}
	return *decliner, Profile{}, true
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
	valid := game.ValidHotbarSlot(slot)
	if !valid {
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

func (s *Store) Equip(name, itemID, equipSlot string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	for _, item := range p.Inventory {
		if item.ID != itemID {
			continue
		}
		if item.Kind != game.KindEquipment {
			return Profile{}, "That item is not equipment."
		}
		l := p.ActiveLoadout()
		targetSlot := equipSlot
		if item.Slot == game.SlotWeapon {
			if targetSlot == "" {
				targetSlot = game.SlotWeapon
			}
			if targetSlot != game.SlotWeapon && targetSlot != game.SlotSubWeapon {
				return Profile{}, "Invalid weapon slot."
			}
			if targetSlot == game.SlotSubWeapon && p.SubJob == "" {
				return Profile{}, "Equip a sub job to use the off-hand weapon slot."
			}
			job := game.JobID(p.MainJob)
			if targetSlot == game.SlotSubWeapon {
				job = game.JobID(p.SubJob)
			}
			if !game.JobAllowsWeapon(job, game.WeaponType(item.Type)) {
				return Profile{}, game.EquipWeaponDeniedMessage(job, game.WeaponType(item.Type))
			}
		} else {
			targetSlot = item.Slot
		}
		if !game.ValidEquipSlot(targetSlot) {
			return Profile{}, "Invalid equipment slot."
		}
		l.Equipped[targetSlot] = item.ID
		if item.Slot == game.SlotWeapon {
			other := game.SlotSubWeapon
			if targetSlot == game.SlotSubWeapon {
				other = game.SlotWeapon
			}
			if l.Equipped[other] == item.ID {
				delete(l.Equipped, other)
			}
		}
		p.Loadouts[p.ComboKey()] = *l
		s.save()
		return *p, ""
	}
	return Profile{}, "You do not own that item."
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

func (s *Store) SetSavePoint(name, savePointID string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	p.SavePointID = savePointID
	p.VisitedSavePoints = addVisited(p.VisitedSavePoints, savePointID)
	s.save()
	return *p, true
}

func addVisited(ids []string, id string) []string {
	if id == "" {
		return ids
	}
	for _, v := range ids {
		if v == id {
			return ids
		}
	}
	return append(ids, id)
}

func (p Profile) HasVisitedSavePoint(id string) bool {
	if id == "" {
		return false
	}
	for _, v := range p.VisitedSavePoints {
		if v == id {
			return true
		}
	}
	return false
}

func startingUnlockedJobs() []string {
	out := make([]string, len(game.StartingJobs))
	for i, j := range game.StartingJobs {
		out[i] = string(j)
	}
	return out
}

func (p *Profile) ensureUnlockedJobs() {
	if p.UnlockedJobs == nil {
		p.UnlockedJobs = []string{}
	}
	if len(p.UnlockedJobs) == 0 {
		p.UnlockedJobs = startingUnlockedJobs()
	}
	p.addUnlockedJob(game.JobID(p.MainJob))
	if p.SubJob != "" {
		p.addUnlockedJob(game.JobID(p.SubJob))
	}
}

func (p *Profile) addUnlockedJob(job game.JobID) {
	if job == "" || !game.ValidJob(job) {
		return
	}
	id := string(job)
	for _, j := range p.UnlockedJobs {
		if j == id {
			return
		}
	}
	p.UnlockedJobs = append(p.UnlockedJobs, id)
}

// HasUnlockedJob reports whether the hero may equip the job as main or sub.
func (p Profile) HasUnlockedJob(job game.JobID) bool {
	if job == "" {
		return false
	}
	id := string(job)
	for _, j := range p.UnlockedJobs {
		if j == id {
			return true
		}
	}
	if len(p.UnlockedJobs) == 0 {
		return game.ValidStartingJob(job)
	}
	return false
}

// UnlockJob permanently unlocks a job for the hero (quests / rewards).
func (s *Store) UnlockJob(name string, job game.JobID) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Unknown hero."
	}
	job = game.JobID(normalizeJobID(string(job)))
	if !game.ValidJob(job) {
		return *p, "Unknown job."
	}
	p.ensureUnlockedJobs()
	p.addUnlockedJob(job)
	if p.Jobs == nil {
		p.Jobs = map[string]game.JobProgress{}
	}
	if _, ok := p.Jobs[string(job)]; !ok {
		p.Jobs[string(job)] = game.JobProgress{Level: 1, XP: 0}
	}
	s.save()
	return *p, ""
}

func (s *Store) SetMapID(name, mapID string) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	p.MapID = mapID
	s.save()
	return *p, true
}

// SetWorldLocation stores the hero's last map and overworld position.
// Memory is always updated; the JSON file is written when flush is true.
// When mapID changes, the previous MapID is retained in PrevMapID.
func (s *Store) SetWorldLocation(name, mapID string, x, y float64, facing string, flush bool) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	if mapID != "" {
		if p.MapID != "" && p.MapID != mapID {
			p.PrevMapID = p.MapID
		}
		p.MapID = mapID
	}
	p.WorldX = x
	p.WorldY = y
	p.Facing = facing
	p.HasWorldPos = true
	if flush {
		s.save()
	}
	return *p, true
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
