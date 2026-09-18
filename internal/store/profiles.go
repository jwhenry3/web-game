package store

import (
	"clara-mundi/internal/game"
)

// HotbarBinding assigns a skill or consumable type to a quick-use slot.
type HotbarBinding struct {
	Kind string `json:"kind"` // "skill" | "item"
	ID   string `json:"id"`   // skill id or consumable def id
}

// Profile is a single hero's persisted state: identity, per-job progress,
// combo loadouts, shared inventory, housing, pets, friends and position.
type Profile struct {
	AccountID    string                      `json:"account_id,omitempty"`
	Name         string                      `json:"name"`
	Race         string                      `json:"race,omitempty"`
	MainJob      string                      `json:"main_job"`
	SubJob       string                      `json:"sub_job"`
	UnlockedJobs []string                    `json:"unlocked_jobs,omitempty"`
	Appearance   Appearance                  `json:"appearance,omitempty"`
	Jobs         map[string]game.JobProgress `json:"jobs"`
	Loadouts     map[string]JobLoadout       `json:"loadouts"`
	Inventory    []game.Item                 `json:"inventory"`
	// HouseStorage is separate from inventory; only accessible inside an active camp house.
	HouseStorage []game.Item `json:"house_storage,omitempty"`
	// HouseFurniture persists decorations placed inside the house.
	HouseFurniture []game.HouseFurniture `json:"house_furniture,omitempty"`
	// CampSkin is the overworld tent graphic (see game.CampSkins).
	CampSkin string `json:"camp_skin,omitempty"`
	// Pets is the captured companion collection.
	Pets []game.PetRecord `json:"pets,omitempty"`
	// FollowPetID is a legacy slot merged into BattlePetID on load: every
	// active pet both follows and fights, so a follow-only concept adds
	// nothing. Kept only so old saves still unmarshal.
	FollowPetID string `json:"follow_pet_id,omitempty"`
	// BattlePetID is the active pet that follows and joins fights (empty = none).
	BattlePetID string `json:"battle_pet_id,omitempty"`
	// MountPetID marks the pet the mount keybind rides once mounting lands.
	MountPetID             string            `json:"mount_pet_id,omitempty"`
	Friends                []string          `json:"friends"`
	IncomingFriendRequests []string          `json:"incoming_friend_requests,omitempty"`
	OutgoingFriendRequests []string          `json:"outgoing_friend_requests,omitempty"`
	Keybinds               map[string]string `json:"keybinds,omitempty"`
	SavePointID            string            `json:"save_point_id,omitempty"`
	VisitedSavePoints      []string          `json:"visited_save_points,omitempty"`
	MapID                  string            `json:"map_id,omitempty"`
	PrevMapID              string            `json:"pdnc_map_id,omitempty"`
	// WorldID is the singular-world id that owns the persisted WorldX/Y
	// position. In world mode it is written instead of MapID so the legacy
	// map-routing fields (MapID/PrevMapID) stay untouched.
	WorldID     string         `json:"world_id,omitempty"`
	WorldX      float64        `json:"world_x,omitempty"`
	WorldY      float64        `json:"world_y,omitempty"`
	Facing      game.FacingYaw `json:"facing,omitempty"`
	HasWorldPos bool           `json:"has_world_pos,omitempty"`

	// Legacy fields migrated into Jobs/Loadouts on load.
	Level          int                      `json:"level,omitempty"`
	XP             int                      `json:"xp,omitempty"`
	Proficiency    map[string]int           `json:"proficiency,omitempty"`
	UnlockedSkills []string                 `json:"unlocked_skills,omitempty"`
	Equipped       map[string]string        `json:"equipped,omitempty"`
	Hotbar         map[string]HotbarBinding `json:"hotbar,omitempty"`
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

// PersistedWorldID reports which world or map owns the saved WorldX/Y
// position: WorldID when present (singular-world mode), else the legacy MapID
// (written by older world-mode builds and by per-map hubs).
func (p Profile) PersistedWorldID() string {
	if p.WorldID != "" {
		return p.WorldID
	}
	return p.MapID
}
