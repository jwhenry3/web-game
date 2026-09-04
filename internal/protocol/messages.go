package protocol

import (
	"encoding/json"
	"log"

	"clara-mundi/internal/game"
)

// The protocol is a structured Envelope system: every frame on the wire is a
// JSON object with a MessageType and a type-specific payload.

type MessageType string

// Client -> Server
const (
	TypeJoinWorld           MessageType = "join_world"
	TypeMove                MessageType = "move"
	TypeChat                MessageType = "chat"
	TypeEquip               MessageType = "equip"
	TypeUnequip             MessageType = "unequip"
	TypeSetJobs             MessageType = "set_jobs"
	TypeSetHotbar           MessageType = "set_hotbar"
	TypeSetKeybinds         MessageType = "set_keybinds"
	TypeAddFriend           MessageType = "add_friend"
	TypeAcceptFriend        MessageType = "accept_friend"
	TypeDeclineFriend       MessageType = "decline_friend"
	TypeRemoveFriend        MessageType = "remove_friend"
	TypePartyInvite         MessageType = "party_invite"
	TypePartyAccept         MessageType = "party_accept"
	TypePartyDecline        MessageType = "party_decline"
	TypePartyLeave          MessageType = "party_leave"
	TypePartyKick           MessageType = "party_kick"
	TypeDeclineBattleInvite MessageType = "decline_battle_invite"
	TypeJoinBattle          MessageType = "join_battle"
	TypeLeaveBattle         MessageType = "leave_battle"
	TypeAction              MessageType = "action"
	TypeSetTarget           MessageType = "set_target"
	TypeSetSavePoint        MessageType = "set_save_point"
	TypeUseWorldSkill       MessageType = "use_world_skill"
	TypeEnterHouse          MessageType = "enter_house"
	TypeLeaveHouse          MessageType = "leave_house"
	TypeHouseInteract       MessageType = "house_interact"
	TypeHouseStorageDeposit MessageType = "house_storage_deposit"
	TypeHouseStorageWithdraw MessageType = "house_storage_withdraw"
	TypeHousePlaceFurniture MessageType = "house_place_furniture"
	TypeHousePickFurniture  MessageType = "house_pick_furniture"
	TypeSetCampSkin         MessageType = "set_camp_skin"
	TypePetSetFollow        MessageType = "pet_set_follow"
	TypePetSetBattle        MessageType = "pet_set_battle"
	TypePetRelease          MessageType = "pet_release"
	// Realtime combat plugin (combat.realtime)
	TypeRTMove   MessageType = "rt_move"
	TypeRTAttack MessageType = "rt_attack"
)

// Server -> Client
const (
	TypeWelcome         MessageType = "welcome"
	TypeWorldState      MessageType = "world_state"
	TypePlayerJoin      MessageType = "player_joined"
	TypePlayerLeft      MessageType = "player_left"
	TypePlayerMoved     MessageType = "player_moved"
	TypePlayerSync      MessageType = "player_sync" // status/job/level changes
	TypeChatMsg         MessageType = "chat_message"
	TypeNPCState        MessageType = "npc_state"
	TypeSocialState     MessageType = "social_state"
	TypePartyInviteMsg    MessageType = "party_invite_received"
	TypeBattleInviteMsg   MessageType = "battle_invite_received"
	TypeFriendRequestMsg  MessageType = "friend_request_received"
	TypeRewardNotice    MessageType = "reward_notice"
	TypeBattleList      MessageType = "battle_list"
	TypeBattleState     MessageType = "battle_state"
	TypeBattleEvent     MessageType = "battle_event" // batched action-window results
	TypeBattleTick      MessageType = "battle_tick"  // lightweight ATB sync
	TypeBattleEnd       MessageType = "battle_end"
	TypeBattleReturn    MessageType = "battle_return" // server force/ack return to overworld
	TypeCampState       MessageType = "camp_state"
	TypeHouseState      MessageType = "house_state"
	TypeHouseReturn     MessageType = "house_return"
	TypePetState        MessageType = "pet_state"
	TypeError           MessageType = "error"
	TypeMapConfig       MessageType = "map_config"
	// Realtime combat plugin (combat.realtime)
	TypeRTBattleState MessageType = "rt_battle_state"
	TypeRTBattleTick  MessageType = "rt_battle_tick"
	TypeRTBattleEvent MessageType = "rt_battle_event"
	TypeRTBattleEnd   MessageType = "rt_battle_end"
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
	PlayerName string               `json:"player_name"`
	Race       string               `json:"race,omitempty"`
	MainJob    string               `json:"main_job,omitempty"`
	SubJob     string               `json:"sub_job,omitempty"`
	Job        string               `json:"job,omitempty"`    // legacy
	Weapon     string               `json:"weapon,omitempty"` // legacy
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
	MainJob      string `json:"main_job"`
	SubJob       string `json:"sub_job"` // "" clears subjob
	JobChangerID string `json:"job_changer_id"`
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
	Slot string `json:"slot"` // "1".."8", "ctrl+1".."ctrl+8", "shift+1".."shift+8"
	Kind string `json:"kind"` // "skill" | "item" | "" to clear
	ID   string `json:"id"`
}

type SetKeybindsPayload struct {
	Keybinds map[string]string `json:"keybinds"`
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
	ActionID string `json:"action_id"` // skill id, or "use_item", or "capture"
	TargetID string `json:"target_id"`
	ItemID   string `json:"item_id,omitempty"`   // consumable instance for use_item
	ActorID  string `json:"actor_id,omitempty"` // optional: owned pet id to command
}

type PetIDPayload struct {
	PetID string `json:"pet_id"`
}

type SetTargetPayload struct {
	TargetID string `json:"target_id"`
}

type SetSavePointPayload struct {
	SavePointID string `json:"save_point_id"`
}

type UseWorldSkillPayload struct {
	SkillID     string `json:"skill_id"`
	SavePointID string `json:"save_point_id,omitempty"`
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
	WorldOnly   bool   `json:"world_only,omitempty"`
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
	Name              string                   `json:"name"`
	Level             int                      `json:"level"` // main job level
	XP                int                      `json:"xp"`
	MaxXP             int                      `json:"max_xp"`
	Race              string                   `json:"race,omitempty"`
	MainJob           string                   `json:"main_job"`
	SubJob            string                   `json:"sub_job"`
	SubjobUnlock      int                      `json:"subjob_unlock_level"`
	UnlockedJobs      []string                 `json:"unlocked_jobs"`
	Appearance        CharacterAppearance      `json:"appearance,omitempty"`
	Jobs              []JobProgressInfo        `json:"jobs"`
	Stats             StatBlock                `json:"stats"`
	Inventory         []game.Item              `json:"inventory"`
	HouseStorage      []game.Item              `json:"house_storage,omitempty"`
	HouseStorageCap   int                      `json:"house_storage_capacity,omitempty"`
	CampSkin          string                   `json:"camp_skin,omitempty"`
	Equipped          map[string]string        `json:"equipped"`
	Hotbar            map[string]HotbarBinding `json:"hotbar"`
	Skills            []SkillInfo              `json:"skills"`
	Friends           []string                 `json:"friends"`
	SavePointID       string                   `json:"save_point_id,omitempty"`
	SavePointName     string                   `json:"save_point_name,omitempty"`
	VisitedSavePoints []VisitedSavePoint     `json:"visited_save_points,omitempty"`
	Keybinds          map[string]string      `json:"keybinds,omitempty"`
	Pets              []game.PetRecord       `json:"pets,omitempty"`
	FollowPetID       string                 `json:"follow_pet_id,omitempty"`
	BattlePetID       string                 `json:"battle_pet_id,omitempty"`
}

type VisitedSavePoint struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	MapName string `json:"map_name,omitempty"`
	Home    bool   `json:"home,omitempty"`
}

type WelcomePayload struct {
	PlayerID string       `json:"player_id"`
	Profile  ProfileInfo  `json:"profile"`
	Map      *MapSnapshot `json:"map,omitempty"`
}

// MapSnapshot is what the current map server is responsible for. Cluster
// topology and transfer rules are omitted.
type MapSnapshot struct {
	ID           string       `json:"id"`
	Name         string       `json:"name"`
	Combat       string       `json:"combat"`
	Capabilities []string     `json:"capabilities"`
	Modules      []MapModule  `json:"modules"`
	Overworld    OverworldMap `json:"overworld"`
	TiledMap      string       `json:"tiled_map,omitempty"`
	Portals       []MapPortal  `json:"portals,omitempty"`
	TileOverrides *MapTileOverrides `json:"tile_overrides,omitempty"`
	TerrainLayers *MapTerrainLayers `json:"terrain_layers,omitempty"`
}

// MapTerrainLayers is the composed ground/collision grid from the map editor config.
type MapTerrainLayers struct {
	Ground    []int `json:"ground"`
	Collision []int `json:"collision"`
}

// MapConfigPayload pushes an updated map snapshot after editor override reload.
type MapConfigPayload struct {
	Map *MapSnapshot `json:"map"`
}

// MapTileOverrides is a sparse set of tile patches per layer for client rendering.
type MapTileOverrides struct {
	MapID     string                    `json:"map_id"`
	Layers    map[string]map[string]int `json:"layers"`
	UpdatedAt string                    `json:"updated_at,omitempty"`
}

// MapPortal is a zone-border strip on the current map. Destination is not sent.
type MapPortal struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
	W float64 `json:"w"`
	H float64 `json:"h"`
}

type MapModule struct {
	ID           string         `json:"id"`
	Name         string         `json:"name"`
	Version      string         `json:"version"`
	Capabilities []string       `json:"capabilities"`
	Frontend     MapFrontend    `json:"frontend"`
	Config       map[string]any `json:"config,omitempty"`
}

type MapFrontend struct {
	PluginID string `json:"pluginId"`
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
	Facing      string              `json:"facing,omitempty"` // "left" or "right"
	InBattle    bool                `json:"in_battle"`        // combat-locked state
	BattleID    string              `json:"battle_id,omitempty"`
	InHouse     bool                `json:"in_house,omitempty"`
	HouseOwner  string              `json:"house_owner,omitempty"` // owner character name
	ImmuneUntil int64               `json:"immune_until,omitempty"` // unix millis; collision/search blocked
	// Field-cast (Teleport). Clients interpolate a bar from local receipt + CastTimeMs.
	CastingSkillID string `json:"casting_skill_id,omitempty"`
	CastTimeMs     int    `json:"cast_time_ms,omitempty"`
	CastEndsAt     int64  `json:"cast_ends_at,omitempty"` // unix millis
}

type BattleInfo struct {
	BattleID     string `json:"battle_id"`
	Participants int    `json:"participants"`
	MaxPlayers   int    `json:"max_players"`
	Level        int    `json:"level"`
	Mode         string `json:"mode,omitempty"`
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

// AtlasPayload is the painted world atlas: every map's terrain and points of interest.
type AtlasPayload struct {
	Maps []AtlasMap `json:"maps"`
}

type AtlasMap struct {
	ID        string       `json:"id"`
	Name      string       `json:"name"`
	Overworld OverworldMap `json:"overworld"`
	POIs      []AtlasPOI   `json:"pois"`
}

type AtlasPOI struct {
	ID   string  `json:"id"`
	Kind string  `json:"kind"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type SavePoint struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type JobChanger struct {
	ID   string  `json:"id"`
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type WorldStatePayload struct {
	Players     []WorldPlayer `json:"players"`
	NPCs        []WorldNPC    `json:"npcs"`
	Camps       []WorldCamp   `json:"camps,omitempty"`
	Pets        []WorldPet    `json:"pets,omitempty"`
	Battles     []BattleInfo  `json:"battles"`
	SavePoints  []SavePoint   `json:"save_points"`
	JobChangers []JobChanger  `json:"job_changers"`
	Map         OverworldMap  `json:"map"`
}

type WorldPet struct {
	ID      string  `json:"id"`
	OwnerID string  `json:"owner_id"`
	Kind    string  `json:"kind"`
	Name    string  `json:"name"`
	Level   int     `json:"level"`
	X       float64 `json:"x"`
	Y       float64 `json:"y"`
	Facing  string  `json:"facing,omitempty"`
}

type PetStatePayload struct {
	Pets []WorldPet `json:"pets"`
}

type WorldCamp struct {
	OwnerName string  `json:"owner_name"`
	OwnerID   string  `json:"owner_id"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Skin      string  `json:"skin"`
}

type CampStatePayload struct {
	Camps []WorldCamp `json:"camps"`
}

type EnterHousePayload struct {
	OwnerName string `json:"owner_name"`
}

type HouseInteractPayload struct {
	Target string `json:"target"` // "door" | "storage"
}

type HouseStorageMovePayload struct {
	ItemID string `json:"item_id"`
	Qty    int    `json:"qty,omitempty"`
}

type HousePlaceFurniturePayload struct {
	ItemID string `json:"item_id"`
	Col    int    `json:"col"`
	Row    int    `json:"row"`
}

type HousePickFurniturePayload struct {
	FurnitureID string `json:"furniture_id"`
}

type SetCampSkinPayload struct {
	Skin string `json:"skin"`
}

type HousePlayer struct {
	ID     string  `json:"id"`
	Name   string  `json:"name"`
	X      float64 `json:"x"`
	Y      float64 `json:"y"`
	Facing string  `json:"facing,omitempty"`
	Owner  bool    `json:"owner,omitempty"`
}

type HousePOI struct {
	ID   string  `json:"id"`
	Kind string  `json:"kind"` // "door" | "storage"
	Name string  `json:"name"`
	X    float64 `json:"x"`
	Y    float64 `json:"y"`
}

type HouseStatePayload struct {
	OwnerName      string                `json:"owner_name"`
	Skin           string                `json:"skin"`
	MapCols        int                   `json:"map_cols"`
	MapRows        int                   `json:"map_rows"`
	WalkCols       int                   `json:"walk_cols"`
	WalkRows       int                   `json:"walk_rows"`
	WalkOriginCol  int                   `json:"walk_origin_col"`
	WalkOriginRow  int                   `json:"walk_origin_row"`
	TileSize       int                   `json:"tile_size"`
	Players        []HousePlayer         `json:"players"`
	Furniture      []game.HouseFurniture `json:"furniture"`
	POIs           []HousePOI            `json:"pois"`
	Storage        []game.Item           `json:"storage,omitempty"` // owner-only
	StorageCapacity int                  `json:"storage_capacity,omitempty"`
	IsOwner        bool                  `json:"is_owner"`
}

type HouseReturnPayload struct {
	Reason string `json:"reason,omitempty"`
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
	ID             string                `json:"id"`
	Name           string                `json:"name"`
	Kind           string                `json:"kind,omitempty"` // enemies: goblin, dire_wolf, stone_imp
	IsPlayer       bool                  `json:"is_player"`
	IsAlly         bool                  `json:"is_ally,omitempty"`
	OwnerID        string                `json:"owner_id,omitempty"`
	Weapon         string                `json:"weapon,omitempty"`
	Level          int                   `json:"level"`
	HP             int                   `json:"hp"`
	MaxHP          int                   `json:"max_hp"`
	MP             int                   `json:"mp"`
	MaxMP          int                   `json:"max_mp"`
	Agility        int                   `json:"agility"`
	SkillATB       float64               `json:"skill_atb"` // GCD for skills, attack, and consumables
	ATB            float64               `json:"atb"`       // alias of skill_atb for older clients
	TargetID       string                `json:"target_id,omitempty"`
	Alive          bool                  `json:"alive"`
	Capturable     bool                  `json:"capturable,omitempty"`
	Statuses       []game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID string                `json:"casting_skill_id,omitempty"`
	CastTargetID   string                `json:"cast_target_id,omitempty"`
	CastProgress   float64               `json:"cast_progress,omitempty"`
	CastTimeMs     int                   `json:"cast_time_ms,omitempty"`
	HasQueuedAction bool                 `json:"has_queued_action,omitempty"`
}

type BattleStatePayload struct {
	BattleID    string         `json:"battle_id"`
	Entities    []BattleEntity `json:"entities"`
	BattleSpeed float64        `json:"battle_speed,omitempty"`
}

// ActionResult carries the validated outcome of one queued action so clients
// can play the matching animation deterministically (attack vs. fizzle).
type ActionResult struct {
	ActorID       string                `json:"actor_id"`
	ActionID      string                `json:"action_id"`
	ActionName    string                `json:"action_name"`
	TargetID      string                `json:"target_id"`
	ItemID        string                `json:"item_id,omitempty"` // consumed item (use_item)
	Success       bool                  `json:"success"`
	Damage        int                   `json:"damage,omitempty"`
	Heal          int                   `json:"heal,omitempty"`
	MPRestored    int                   `json:"mp_restored,omitempty"`
	Message       string                `json:"message,omitempty"`
	StatusApplied []game.StatusSnapshot `json:"status_applied,omitempty"`
	CastStarted   bool                  `json:"cast_started,omitempty"`
}

type EntityUpdate struct {
	ID             string                `json:"id"`
	HP             int                   `json:"hp"`
	MP             int                   `json:"mp"`
	SkillATB       float64               `json:"skill_atb"`
	ATB            float64               `json:"atb"`
	TargetID       string                `json:"target_id,omitempty"`
	Alive          bool                  `json:"alive"`
	Statuses       []game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID string                `json:"casting_skill_id,omitempty"`
	CastTargetID   string                `json:"cast_target_id,omitempty"`
	CastProgress   float64               `json:"cast_progress,omitempty"`
	CastTimeMs     int                   `json:"cast_time_ms,omitempty"`
}

// BattleEventPayload is the atomic broadcast at the close of each action
// window: every result from the batch plus resulting entity state.
type BattleEventPayload struct {
	Results   []ActionResult `json:"results"`
	Entities  []EntityUpdate `json:"entities"`
	Timestamp int64          `json:"timestamp"`
}

type BattleTickPayload struct {
	SkillATB       map[string]float64               `json:"skill_atb"`
	ATB            map[string]float64               `json:"atb"` // skill_atb alias
	HP             map[string]int                   `json:"hp,omitempty"`
	Alive          map[string]bool                  `json:"alive,omitempty"`
	Statuses       map[string][]game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID map[string]string                `json:"casting_skill_id,omitempty"`
	CastTargetID   map[string]string                `json:"cast_target_id,omitempty"`
	CastProgress   map[string]float64               `json:"cast_progress,omitempty"`
	CastTimeMs     map[string]int                   `json:"cast_time_ms,omitempty"`
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
	ID       string        `json:"id"`
	LeaderID string        `json:"leader_id"`
	Members  []PartyMember `json:"members"`
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

type FriendRequestPayload struct {
	FromID   string `json:"from_id,omitempty"`
	FromName string `json:"from_name"`
}

type RewardNoticePayload struct {
	XP      int    `json:"xp"`
	Passive bool   `json:"passive,omitempty"`
	Victory bool   `json:"victory"`
	Message string `json:"message"`
}

type SocialStatePayload struct {
	Friends                 []FriendInfo           `json:"friends"`
	Party                   *PartyInfo             `json:"party,omitempty"`
	PendingInvite           *PartyInvitePayload    `json:"pending_invite,omitempty"`
	PendingFriendRequests   []FriendRequestPayload `json:"pending_friend_requests,omitempty"`
	OutgoingFriendRequests  []string               `json:"outgoing_friend_requests,omitempty"`
}

type ErrorPayload struct {
	Message string `json:"message"`
}

// ---- Realtime combat (combat.realtime) ----

type RTMovePayload struct {
	X float64 `json:"x"`
	Y float64 `json:"y"`
}

type RTAttackPayload struct {
	FacingX float64 `json:"facing_x"`
	FacingY float64 `json:"facing_y"`
}

type RTBattleEntity struct {
	ID              string                `json:"id"`
	Name            string                `json:"name"`
	Kind            string                `json:"kind,omitempty"`
	IsPlayer        bool                  `json:"is_player"`
	IsAlly          bool                  `json:"is_ally,omitempty"`
	OwnerID         string                `json:"owner_id,omitempty"`
	X               float64               `json:"x"`
	Y               float64               `json:"y"`
	HP              int                   `json:"hp"`
	MaxHP           int                   `json:"max_hp"`
	MP              int                   `json:"mp,omitempty"`
	MaxMP           int                   `json:"max_mp,omitempty"`
	SkillATB        float64               `json:"skill_atb,omitempty"`
	TargetID        string                `json:"target_id,omitempty"`
	Alive           bool                  `json:"alive"`
	Capturable      bool                  `json:"capturable,omitempty"`
	Statuses        []game.StatusSnapshot `json:"statuses,omitempty"`
	CastingSkillID  string                `json:"casting_skill_id,omitempty"`
	CastTargetID    string                `json:"cast_target_id,omitempty"`
	CastProgress    float64               `json:"cast_progress,omitempty"`
	CastTimeMs      int                   `json:"cast_time_ms,omitempty"`
	HasQueuedAction bool                  `json:"has_queued_action,omitempty"`
}

type RTBattleStatePayload struct {
	BattleID string           `json:"battle_id"`
	Entities []RTBattleEntity `json:"entities"`
	Mode     string           `json:"mode"`
}

type RTBattleTickPayload struct {
	Entities []RTBattleEntity `json:"entities"`
}

type RTBattleEventPayload struct {
	AttackerID    string           `json:"attacker_id"`
	TargetID      string           `json:"target_id"`
	Damage        int              `json:"damage"`
	Heal          int              `json:"heal,omitempty"`
	MPRestored    int              `json:"mp_restored,omitempty"`
	Hit           bool             `json:"hit"`
	Message       string           `json:"message,omitempty"`
	ActionID      string           `json:"action_id,omitempty"`
	ActionName    string           `json:"action_name,omitempty"`
	Success       bool             `json:"success,omitempty"`
	CastStarted   bool             `json:"cast_started,omitempty"`
	CastCancelled bool             `json:"cast_cancelled,omitempty"`
	Entities      []RTBattleEntity `json:"entities"`
}

type RTBattleEndPayload struct {
	Victory bool           `json:"victory"`
	Rewards []PlayerReward `json:"rewards"`
}
