package protocol

import (
	"encoding/json"
	"log"

	"ffv-web-game/internal/game"
)

// The protocol is a structured Envelope system: every frame on the wire is a
// JSON object with a MessageType and a type-specific payload.

type MessageType string

// Client -> Server
const (
	TypeJoinWorld   MessageType = "join_world"
	TypeMove        MessageType = "move"
	TypeChat        MessageType = "chat"
	TypeEquip       MessageType = "equip"
	TypeUnequip     MessageType = "unequip"
	TypeSetJobs     MessageType = "set_jobs"
	TypeSetHotbar   MessageType = "set_hotbar"
	TypeAddFriend   MessageType = "add_friend"
	TypeRemoveFriend MessageType = "remove_friend"
	TypePartyInvite MessageType = "party_invite"
	TypePartyAccept MessageType = "party_accept"
	TypePartyDecline MessageType = "party_decline"
	TypePartyLeave  MessageType = "party_leave"
	TypePartyKick   MessageType = "party_kick"
	TypeDeclineBattleInvite MessageType = "decline_battle_invite"
	TypeJoinBattle  MessageType = "join_battle"
	TypeLeaveBattle MessageType = "leave_battle"
	TypeAction      MessageType = "action"
	TypeSetTarget   MessageType = "set_target"
)

// Server -> Client
const (
	TypeWelcome     MessageType = "welcome"
	TypeWorldState  MessageType = "world_state"
	TypePlayerJoin  MessageType = "player_joined"
	TypePlayerLeft  MessageType = "player_left"
	TypePlayerMoved MessageType = "player_moved"
	TypePlayerSync  MessageType = "player_sync" // status/job/level changes
	TypeChatMsg     MessageType = "chat_message"
	TypeNPCState    MessageType = "npc_state"
	TypeSocialState MessageType = "social_state"
	TypePartyInviteMsg MessageType = "party_invite_received"
	TypeBattleInviteMsg MessageType = "battle_invite_received"
	TypeRewardNotice    MessageType = "reward_notice"
	TypeBattleList  MessageType = "battle_list"
	TypeBattleState MessageType = "battle_state"
	TypeBattleEvent MessageType = "battle_event" // batched action-window results
	TypeBattleTick  MessageType = "battle_tick"  // lightweight ATB sync
	TypeBattleEnd   MessageType = "battle_end"
	TypeError       MessageType = "error"
)

type Envelope struct {
	Type    MessageType     `json:"type"`
	Payload json.RawMessage `json:"payload,omitempty"`
}

// Encode marshals a payload into a wire-ready envelope frame.
func Encode(t MessageType, payload any) []byte {
	raw, err := json.Marshal(payload)
	if err != nil {
		log.Printf("protocol: failed to marshal %s payload: %v", t, err)
		return nil
	}
	data, err := json.Marshal(Envelope{Type: t, Payload: raw})
	if err != nil {
		log.Printf("protocol: failed to marshal envelope %s: %v", t, err)
		return nil
	}
	return data
}

// ---- Client -> Server payloads ----

type JoinWorldPayload struct {
	PlayerName string              `json:"player_name"`
	Race       string              `json:"race,omitempty"`
	MainJob    string              `json:"main_job,omitempty"`
	SubJob     string              `json:"sub_job,omitempty"`
	Job        string              `json:"job,omitempty"`    // legacy
	Weapon     string              `json:"weapon,omitempty"` // legacy
	Appearance *CharacterAppearance `json:"appearance,omitempty"`
}

type CharacterAppearance struct {
	Skin        string `json:"skin"`
	Face        string `json:"face"`
	Hair        string `json:"hair"`
	HairColor   string `json:"hair_color"`
	Cloth       string `json:"cloth"`
	ClothColor  string `json:"cloth_color"`
	Weapon      string `json:"weapon"`
	WeaponColor string `json:"weapon_color"`
}

type SetJobsPayload struct {
	MainJob string `json:"main_job"`
	SubJob  string `json:"sub_job"` // "" clears subjob
}

type MovePayload struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type ChatPayload struct {
	Message string `json:"message"`
}

type EquipPayload struct {
	ItemID string `json:"item_id"`
	Slot   string `json:"slot,omitempty"` // weapon | sub_weapon for weapons; armor ignores this
}

type UnequipPayload struct {
	Slot string `json:"slot"`
}

type SetHotbarPayload struct {
	Slot string `json:"slot"` // "1".."5"
	Kind string `json:"kind"` // "skill" | "item" | "" to clear
	ID   string `json:"id"`
}

type PlayerNamePayload struct {
	PlayerName string `json:"player_name"`
}

type PartyKickPayload struct {
	MemberID string `json:"member_id"`
}

type JoinBattlePayload struct {
	BattleID string `json:"battle_id"`
}

type ActionPayload struct {
	ActionID string `json:"action_id"` // skill id, or "use_item"
	TargetID string `json:"target_id"`
	ItemID   string `json:"item_id,omitempty"` // consumable instance for use_item
}

type SetTargetPayload struct {
	TargetID string `json:"target_id"`
}

// ---- Server -> Client payloads ----

type SkillInfo struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	MPCost      int    `json:"mp_cost"`
	Heals       bool   `json:"heals"`
	Buffs       bool   `json:"buffs"`
	Description string `json:"description"`
	Job         string `json:"job,omitempty"`
	Category    string `json:"category,omitempty"`
	Prereq      string `json:"prereq,omitempty"`
	WeaponReq   string `json:"weapon_req,omitempty"`
	Unlocked    bool   `json:"unlocked"`
	Level       int    `json:"level"`
	MaxLevel    int    `json:"max_level"`
	UnlockLevel int    `json:"unlock_level"`
	Usage       int    `json:"usage,omitempty"`
	UsageToNext int    `json:"usage_to_next,omitempty"`
	CastTimeMs  int    `json:"cast_time_ms,omitempty"`
}

type JobProgressInfo struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Abbr     string `json:"abbr"`
	Category string `json:"category"`
	Level    int    `json:"level"`
	XP       int    `json:"xp"`
	MaxXP    int    `json:"max_xp"`
}

type StatBlock struct {
	HP  int `json:"hp"`
	MP  int `json:"mp"`
	Str int `json:"str"`
	Mag int `json:"mag"`
	Agi int `json:"agi"`
}

type HotbarBinding struct {
	Kind string `json:"kind"`
	ID   string `json:"id"`
}

type ProfileInfo struct {
	Name             string                     `json:"name"`
	Level            int                        `json:"level"` // main job level
	XP               int                        `json:"xp"`
	MaxXP            int                        `json:"max_xp"`
	Race             string                     `json:"race,omitempty"`
	MainJob          string                     `json:"main_job"`
	SubJob           string                     `json:"sub_job"`
	SubjobUnlock     int                        `json:"subjob_unlock_level"`
	Appearance       CharacterAppearance        `json:"appearance,omitempty"`
	Jobs             []JobProgressInfo          `json:"jobs"`
	Stats            StatBlock                  `json:"stats"`
	Inventory        []game.Item                `json:"inventory"`
	Equipped         map[string]string          `json:"equipped"`
	Hotbar           map[string]HotbarBinding   `json:"hotbar"`
	Skills           []SkillInfo                `json:"skills"`
	Friends          []string                   `json:"friends"`
}

type WelcomePayload struct {
	PlayerID string      `json:"player_id"`
	Profile  ProfileInfo `json:"profile"`
}

type WorldPlayer struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Weapon      string              `json:"weapon"`
	Race        string              `json:"race,omitempty"`
	MainJob     string              `json:"main_job"`
	SubJob      string              `json:"sub_job,omitempty"`
	Level       int                 `json:"level"`
	Appearance  CharacterAppearance `json:"appearance,omitempty"`
	X           float64             `json:"x"`
	Y           float64             `json:"y"`
	InBattle    bool                `json:"in_battle"` // combat-locked state
	BattleID    string              `json:"battle_id,omitempty"`
	ImmuneUntil int64               `json:"immune_until,omitempty"` // unix millis; collision/search blocked
}

type BattleInfo struct {
	BattleID     string `json:"battle_id"`
	Participants int    `json:"participants"`
	MaxPlayers   int    `json:"max_players"`
	Level        int    `json:"level"`
}

type WorldNPC struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Kind     string  `json:"kind"`
	Level    int     `json:"level"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	InBattle bool    `json:"in_battle"`
	BattleID string  `json:"battle_id,omitempty"`
}

type OverworldMap struct {
	Tile  int    `json:"tile"`
	Cols  int    `json:"cols"`
	Rows  int    `json:"rows"`
	Cells string `json:"cells"`
}

type WorldStatePayload struct {
	Players []WorldPlayer `json:"players"`
	NPCs    []WorldNPC    `json:"npcs"`
	Battles []BattleInfo  `json:"battles"`
	Map     OverworldMap  `json:"map"`
}

type NPCStatePayload struct {
	NPCs []WorldNPC `json:"npcs"`
}

type PlayerLeftPayload struct {
	ID string `json:"id"`
}

type PlayerMovedPayload struct {
	ID string  `json:"id"`
	X  float64 `json:"x"`
	Y  float64 `json:"y"`
}

type ChatMessagePayload struct {
	FromID   string `json:"from_id"`
	FromName string `json:"from_name"`
	Message  string `json:"message"`
}

type BattleListPayload struct {
	Battles []BattleInfo `json:"battles"`
}

type BattleEntity struct {
	ID       string  `json:"id"`
	Name     string  `json:"name"`
	Kind     string  `json:"kind,omitempty"` // enemies: goblin, dire_wolf, stone_imp
	IsPlayer bool    `json:"is_player"`
	Weapon   string  `json:"weapon,omitempty"`
	Level    int     `json:"level"`
	HP       int     `json:"hp"`
	MaxHP    int     `json:"max_hp"`
	MP       int     `json:"mp"`
	MaxMP    int     `json:"max_mp"`
	Agility    int     `json:"agility"`
	SkillATB   float64 `json:"skill_atb"` // GCD for skills, attack, and consumables
	ATB        float64 `json:"atb"`      // alias of skill_atb for older clients
	TargetID   string  `json:"target_id,omitempty"`
	Alive      bool    `json:"alive"`
	Statuses   []game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID string  `json:"casting_skill_id,omitempty"`
	CastTargetID   string  `json:"cast_target_id,omitempty"`
	CastProgress   float64 `json:"cast_progress,omitempty"`
	CastTimeMs     int     `json:"cast_time_ms,omitempty"`
}

type BattleStatePayload struct {
	BattleID    string         `json:"battle_id"`
	Entities    []BattleEntity `json:"entities"`
	BattleSpeed float64        `json:"battle_speed,omitempty"`
}

// ActionResult carries the validated outcome of one queued action so clients
// can play the matching animation deterministically (attack vs. fizzle).
type ActionResult struct {
	ActorID    string `json:"actor_id"`
	ActionID   string `json:"action_id"`
	ActionName string `json:"action_name"`
	TargetID   string `json:"target_id"`
	ItemID     string `json:"item_id,omitempty"` // consumed item (use_item)
	Success    bool   `json:"success"`
	Damage     int    `json:"damage,omitempty"`
	Heal       int    `json:"heal,omitempty"`
	MPRestored int    `json:"mp_restored,omitempty"`
	Message    string `json:"message,omitempty"`
	StatusApplied []game.StatusSnapshot `json:"status_applied,omitempty"`
	CastStarted   bool   `json:"cast_started,omitempty"`
}

type EntityUpdate struct {
	ID         string  `json:"id"`
	HP         int     `json:"hp"`
	MP         int     `json:"mp"`
	SkillATB   float64 `json:"skill_atb"`
	ATB        float64 `json:"atb"`
	TargetID   string  `json:"target_id,omitempty"`
	Alive      bool    `json:"alive"`
	Statuses   []game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID string  `json:"casting_skill_id,omitempty"`
	CastTargetID   string  `json:"cast_target_id,omitempty"`
	CastProgress   float64 `json:"cast_progress,omitempty"`
	CastTimeMs     int     `json:"cast_time_ms,omitempty"`
}

// BattleEventPayload is the atomic broadcast at the close of each action
// window: every result from the batch plus resulting entity state.
type BattleEventPayload struct {
	Results   []ActionResult `json:"results"`
	Entities  []EntityUpdate `json:"entities"`
	Timestamp int64          `json:"timestamp"`
}

type BattleTickPayload struct {
	SkillATB  map[string]float64              `json:"skill_atb"`
	ATB       map[string]float64              `json:"atb"` // skill_atb alias
	HP        map[string]int                  `json:"hp,omitempty"`
	Alive     map[string]bool                 `json:"alive,omitempty"`
	Statuses  map[string][]game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID map[string]string          `json:"casting_skill_id,omitempty"`
	CastTargetID   map[string]string          `json:"cast_target_id,omitempty"`
	CastProgress   map[string]float64         `json:"cast_progress,omitempty"`
	CastTimeMs     map[string]int             `json:"cast_time_ms,omitempty"`
}

type PlayerReward struct {
	PlayerID        string      `json:"player_id"`
	XP              int         `json:"xp"`
	SubXP           int         `json:"sub_xp,omitempty"`
	LevelsGained    int         `json:"levels_gained"`
	SubLevelsGained int         `json:"sub_levels_gained,omitempty"`
	NewLevel        int         `json:"new_level"`
	NewXP           int         `json:"new_xp"`
	MaxXP           int         `json:"max_xp"`
	SubNewLevel     int         `json:"sub_new_level,omitempty"`
	SubNewXP        int         `json:"sub_new_xp,omitempty"`
	SubMaxXP        int         `json:"sub_max_xp,omitempty"`
	Loot            []game.Item `json:"loot"`
	Passive         bool        `json:"passive,omitempty"`
	PartyBonus      bool        `json:"party_bonus,omitempty"`
}

type BattleEndPayload struct {
	Victory bool           `json:"victory"`
	Rewards []PlayerReward `json:"rewards"`
}

type FriendInfo struct {
	Name     string `json:"name"`
	Online   bool   `json:"online"`
	Level    int    `json:"level,omitempty"`
	Weapon   string `json:"weapon,omitempty"`
	InBattle bool   `json:"in_battle"`
}

type PartyMember struct {
	ID       string `json:"id"`
	Name     string `json:"name"`
	Level    int    `json:"level"`
	Weapon   string `json:"weapon"`
	Leader   bool   `json:"leader"`
	InBattle bool   `json:"in_battle"`
}

type PartyInfo struct {
	ID      string        `json:"id"`
	LeaderID string       `json:"leader_id"`
	Members []PartyMember `json:"members"`
}

type PartyInvitePayload struct {
	FromID   string `json:"from_id"`
	FromName string `json:"from_name"`
	PartyID  string `json:"party_id"`
}

type BattleInvitePayload struct {
	BattleID string `json:"battle_id"`
	FromID   string `json:"from_id"`
	FromName string `json:"from_name"`
}

type RewardNoticePayload struct {
	XP      int    `json:"xp"`
	Passive bool   `json:"passive,omitempty"`
	Victory bool   `json:"victory"`
	Message string `json:"message"`
}

type SocialStatePayload struct {
	Friends       []FriendInfo        `json:"friends"`
	Party         *PartyInfo          `json:"party,omitempty"`
	PendingInvite *PartyInvitePayload `json:"pending_invite,omitempty"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}
