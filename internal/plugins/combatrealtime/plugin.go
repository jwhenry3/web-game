package combatrealtime

import (
	"encoding/json"
	"time"

	"ffv-web-game/internal/plugins/contracts"
	"ffv-web-game/internal/protocol"
)

// Plugin implements free-movement combat with collider-based hits.
type Plugin struct {
	host  contracts.CombatHost
	rooms map[string]*Room
}

func New() *Plugin {
	return &Plugin{rooms: map[string]*Room{}}
}

func (p *Plugin) ID() string        { return pluginID }
func (p *Plugin) FrontendID() string { return frontendID }

func (p *Plugin) Init(host contracts.CombatHost, _ map[string]any) error {
	p.host = host
	return nil
}

func (p *Plugin) OwnsMessage(msg protocol.MessageType) bool {
	switch msg {
	case protocol.TypeJoinBattle, protocol.TypeLeaveBattle,
		protocol.TypeDeclineBattleInvite,
		protocol.TypeRTMove, protocol.TypeRTAttack,
		protocol.TypeAction, protocol.TypeSetTarget:
		return true
	default:
		return false
	}
}

func (p *Plugin) HandleMessage(clientID string, msg protocol.MessageType, payload json.RawMessage) bool {
	switch msg {
	case protocol.TypeJoinBattle:
		var pld protocol.JoinBattlePayload
		if json.Unmarshal(payload, &pld) != nil {
			return true
		}
		if err := p.Join(clientID, pld.BattleID); err != nil {
			p.host.SendError(clientID, err.Error())
		}
	case protocol.TypeLeaveBattle:
		p.Leave(clientID)
	case protocol.TypeRTMove:
		wp := p.host.WorldPlayer(clientID)
		if wp == nil || wp.BattleID == "" {
			return true
		}
		var pld protocol.RTMovePayload
		if json.Unmarshal(payload, &pld) != nil {
			return true
		}
		if room, ok := p.rooms[wp.BattleID]; ok {
			room.Move(clientID, pld.X, pld.Y)
		}
	case protocol.TypeRTAttack:
		wp := p.host.WorldPlayer(clientID)
		if wp == nil || wp.BattleID == "" {
			return true
		}
		var pld protocol.RTAttackPayload
		if json.Unmarshal(payload, &pld) != nil {
			return true
		}
		if room, ok := p.rooms[wp.BattleID]; ok {
			room.Attack(clientID, pld.FacingX, pld.FacingY)
		}
	case protocol.TypeAction:
		wp := p.host.WorldPlayer(clientID)
		if wp == nil || wp.BattleID == "" {
			p.host.SendError(clientID, "You are not in a battle.")
			return true
		}
		var pld protocol.ActionPayload
		if json.Unmarshal(payload, &pld) != nil {
			return true
		}
		if room, ok := p.rooms[wp.BattleID]; ok {
			room.HandleAction(clientID, pld)
		}
	case protocol.TypeSetTarget:
		wp := p.host.WorldPlayer(clientID)
		if wp == nil || wp.BattleID == "" {
			return true
		}
		var pld protocol.SetTargetPayload
		if json.Unmarshal(payload, &pld) != nil {
			return true
		}
		if room, ok := p.rooms[wp.BattleID]; ok {
			room.SetTarget(clientID, pld.TargetID)
		}
	case protocol.TypeDeclineBattleInvite:
		p.host.ClearBattleInvite(clientID)
	}
	return true
}

func (p *Plugin) StartFromNPC(clientID string, wp *protocol.WorldPlayer, npc contracts.NPCSnapshot) (string, bool) {
	if wp.InBattle || battleImmune(wp) {
		return "", false
	}
	profile, ok := p.host.ProfileFor(clientID)
	if !ok {
		return "", false
	}
	level := npc.Level
	if profile.MainJobLevel() > level {
		level = profile.MainJobLevel()
	}
	id := p.host.NextBattleID()
	room := newRoom(id, level, p.host, npc.Kind)
	p.rooms[id] = room
	go room.Run()

	p.host.EnterBattle(clientID, id)
	room.Join(clientID, profile)
	p.host.SyncPlayer(wp)
	p.host.BroadcastBattleList()
	p.host.PromptPartyForBattle(clientID, id, wp.X, wp.Y)
	return id, true
}

func (p *Plugin) Join(clientID, battleID string) error {
	wp := p.host.WorldPlayer(clientID)
	if wp == nil || wp.InBattle {
		return nil
	}
	room, ok := p.rooms[battleID]
	if !ok {
		return errMsg("That battle no longer exists.")
	}
	if p.host.ParticipantCount(battleID) >= p.host.MaxPartySize() {
		return errMsg("That party is already full.")
	}
	profile, ok := p.host.ProfileFor(clientID)
	if !ok {
		return errMsg("Profile not found.")
	}
	p.host.EnterBattle(clientID, battleID)
	p.host.ClearBattleInvite(clientID)
	room.Join(clientID, profile)
	p.host.SyncPlayer(wp)
	p.host.BroadcastBattleList()
	return nil
}

func (p *Plugin) Leave(clientID string) {
	wp := p.host.WorldPlayer(clientID)
	if wp == nil {
		p.host.ReleaseFromBattle(clientID)
		return
	}
	battleID := wp.BattleID
	if battleID == "" {
		p.host.ReleaseFromBattle(clientID)
		return
	}
	if room, ok := p.rooms[battleID]; ok {
		room.Leave(clientID)
	}
	p.host.ReleaseFromBattle(clientID)
	p.host.BroadcastBattleList()
}

func (p *Plugin) OnDisconnect(clientID string) {
	wp := p.host.WorldPlayer(clientID)
	if wp == nil || wp.BattleID == "" {
		return
	}
	if room, ok := p.rooms[wp.BattleID]; ok {
		room.Leave(clientID)
	}
}

func (p *Plugin) CloseRoom(battleID string) {
	if room, ok := p.rooms[battleID]; ok {
		room.Close()
		delete(p.rooms, battleID)
	}
}

func (p *Plugin) BattleInfos(counts map[string]int) []protocol.BattleInfo {
	out := make([]protocol.BattleInfo, 0, len(p.rooms))
	for id, room := range p.rooms {
		out = append(out, protocol.BattleInfo{
			BattleID:     id,
			Participants: counts[id],
			MaxPlayers:   p.host.MaxPartySize(),
			Level:        room.level,
			Mode:         pluginID,
		})
	}
	return out
}

func (p *Plugin) RoomExists(battleID string) bool {
	_, ok := p.rooms[battleID]
	return ok
}

func (p *Plugin) RoomLevel(battleID string) int {
	if room, ok := p.rooms[battleID]; ok {
		return room.level
	}
	return 1
}

func battleImmune(wp *protocol.WorldPlayer) bool {
	return wp != nil && wp.ImmuneUntil > time.Now().UnixMilli()
}

type errMsg string

func (e errMsg) Error() string { return string(e) }
