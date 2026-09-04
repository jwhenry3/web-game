package server

import (
	"encoding/json"
	"fmt"
	"strings"

	"clara-mundi/internal/protocol"
	"clara-mundi/internal/store"
)

type hubParty struct {
	ID        string
	LeaderID  string
	MemberIDs []string
}

type partyInvite struct {
	FromID   string
	FromName string
	PartyID  string // empty until party exists; filled when inviter already leads one
}

type battleInvite struct {
	BattleID string
	FromID   string
	FromName string
}

func (h *Hub) initSocial() {
	if h.parties == nil {
		h.parties = map[string]*hubParty{}
	}
	if h.clientParty == nil {
		h.clientParty = map[string]string{}
	}
	if h.partyInvites == nil {
		h.partyInvites = map[string]*partyInvite{}
	}
	if h.battleInvites == nil {
		h.battleInvites = map[string]*battleInvite{}
	}
	if h.battleMeta == nil {
		h.battleMeta = map[string]*battleMeta{}
	}
}

func (h *Hub) findClientByName(name string) *Client {
	for _, c := range h.clients {
		if c.Joined && strings.EqualFold(c.Name, name) {
			return c
		}
	}
	return nil
}

func (h *Hub) findWorldByName(name string) *protocol.WorldPlayer {
	for _, wp := range h.world {
		if strings.EqualFold(wp.Name, name) {
			return wp
		}
	}
	return nil
}

func (h *Hub) buildFriendList(profile store.Profile) []protocol.FriendInfo {
	out := make([]protocol.FriendInfo, 0, len(profile.Friends))
	for _, fname := range profile.Friends {
		fi := protocol.FriendInfo{Name: fname}
		if wp := h.findWorldByName(fname); wp != nil {
			fi.Online = true
			fi.Level = wp.Level
			fi.Weapon = wp.Weapon
			fi.InBattle = wp.InBattle
		}
		out = append(out, fi)
	}
	return out
}

func (h *Hub) buildPartyInfo(party *hubParty) *protocol.PartyInfo {
	if party == nil {
		return nil
	}
	members := make([]protocol.PartyMember, 0, len(party.MemberIDs))
	for _, id := range party.MemberIDs {
		wp := h.world[id]
		if wp == nil {
			continue
		}
		members = append(members, protocol.PartyMember{
			ID: wp.ID, Name: wp.Name, Level: wp.Level, Weapon: wp.Weapon,
			Leader: id == party.LeaderID, InBattle: wp.InBattle,
		})
	}
	return &protocol.PartyInfo{
		ID: party.ID, LeaderID: party.LeaderID, Members: members,
	}
}

func (h *Hub) buildFriendRequests(profile store.Profile) []protocol.FriendRequestPayload {
	out := make([]protocol.FriendRequestPayload, 0, len(profile.IncomingFriendRequests))
	for _, fname := range profile.IncomingFriendRequests {
		req := protocol.FriendRequestPayload{FromName: fname}
		if wp := h.findWorldByName(fname); wp != nil {
			req.FromID = wp.ID
		}
		out = append(out, req)
	}
	return out
}

func (h *Hub) sendSocialState(c *Client) {
	if c == nil || !c.Joined {
		return
	}
	profile, ok := h.store.Get(c.Name)
	if !ok {
		return
	}
	payload := protocol.SocialStatePayload{
		Friends:                h.buildFriendList(profile),
		PendingFriendRequests:  h.buildFriendRequests(profile),
		OutgoingFriendRequests: append([]string(nil), profile.OutgoingFriendRequests...),
	}
	if partyID, ok := h.clientParty[c.ID]; ok {
		payload.Party = h.buildPartyInfo(h.parties[partyID])
	}
	if inv, ok := h.partyInvites[c.ID]; ok {
		payload.PendingInvite = &protocol.PartyInvitePayload{
			FromID: inv.FromID, FromName: inv.FromName, PartyID: inv.PartyID,
		}
	}
	h.send(c, protocol.TypeSocialState, payload)
}

func (h *Hub) broadcastPartySocial(party *hubParty) {
	if party == nil {
		return
	}
	for _, id := range party.MemberIDs {
		h.mu.RLock()
		c := h.clients[id]
		h.mu.RUnlock()
		if c != nil {
			h.sendSocialState(c)
		}
	}
}

func (h *Hub) refreshFriendsSocial(heroName string) {
	for _, c := range h.clients {
		if !c.Joined {
			continue
		}
		profile, ok := h.store.Get(c.Name)
		if !ok {
			continue
		}
		for _, f := range profile.Friends {
			if strings.EqualFold(f, heroName) {
				h.sendSocialState(c)
				break
			}
		}
	}
}

func (h *Hub) handleAddFriend(c *Client, raw json.RawMessage) {
	var p protocol.PlayerNamePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, msg := h.store.SendFriendRequest(c.Name, p.PlayerName)
	if msg != "" {
		h.sendError(c, msg)
		return
	}
	h.sendWelcome(c, profile)

	otherProfile, hasOther := h.store.FindByName(p.PlayerName)
	target := h.findClientByName(p.PlayerName)
	becameFriends := hasOther && friendListLinked(profile, otherProfile)

	if target != nil {
		if becameFriends {
			h.sendWelcome(target, otherProfile)
		} else if friendRequestPending(otherProfile, c.Name) {
			h.send(target, protocol.TypeFriendRequestMsg, protocol.FriendRequestPayload{
				FromID: c.ID, FromName: c.Name,
			})
		}
		h.sendSocialState(target)
	}
	h.sendSocialState(c)
	h.refreshFriendsSocial(c.Name)
	if hasOther {
		h.refreshFriendsSocial(otherProfile.Name)
	}
}

func friendRequestPending(p store.Profile, fromName string) bool {
	for _, n := range p.IncomingFriendRequests {
		if strings.EqualFold(n, fromName) {
			return true
		}
	}
	return false
}

func friendListLinked(a, b store.Profile) bool {
	for _, f := range a.Friends {
		if strings.EqualFold(f, b.Name) {
			return true
		}
	}
	return false
}

func (h *Hub) handleAcceptFriend(c *Client, raw json.RawMessage) {
	var p protocol.PlayerNamePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	accepter, other, msg := h.store.AcceptFriendRequest(c.Name, p.PlayerName)
	if msg != "" {
		h.sendError(c, msg)
		return
	}
	h.sendWelcome(c, accepter)
	h.sendSocialState(c)
	h.refreshFriendsSocial(c.Name)
	h.refreshFriendsSocial(other.Name)

	target := h.findClientByName(other.Name)
	if target != nil {
		h.sendWelcome(target, other)
		h.sendSocialState(target)
	}
}

func (h *Hub) handleDeclineFriend(c *Client, raw json.RawMessage) {
	var p protocol.PlayerNamePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	_, other, ok := h.store.DeclineFriendRequest(c.Name, p.PlayerName)
	if !ok {
		h.sendError(c, "No friend request from that hero.")
		return
	}
	h.sendSocialState(c)
	target := h.findClientByName(p.PlayerName)
	if target != nil {
		h.sendWelcome(target, other)
		h.sendSocialState(target)
	}
}

func (h *Hub) handleRemoveFriend(c *Client, raw json.RawMessage) {
	var p protocol.PlayerNamePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	profile, ok := h.store.RemoveFriend(c.Name, p.PlayerName)
	if !ok {
		h.sendError(c, "That hero is not on your friend list.")
		return
	}
	h.sendWelcome(c, profile)
	h.sendSocialState(c)
}

func (h *Hub) handlePartyInvite(c *Client, raw json.RawMessage) {
	var p protocol.PlayerNamePayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	target := h.findClientByName(p.PlayerName)
	if target == nil {
		h.sendError(c, "That hero is not online.")
		return
	}
	if target.ID == c.ID {
		h.sendError(c, "You cannot invite yourself.")
		return
	}
	if _, inParty := h.clientParty[target.ID]; inParty {
		h.sendError(c, "They are already in a party.")
		return
	}
	if h.partyInvites[target.ID] != nil {
		h.sendError(c, "They already have a pending invite.")
		return
	}

	partyID := h.clientParty[c.ID]
	if partyID != "" {
		party := h.parties[partyID]
		if party != nil && len(party.MemberIDs) >= maxPartySize {
			h.sendError(c, "Your party is full.")
			return
		}
		if party != nil && c.ID != party.LeaderID {
			h.sendError(c, "Only the party leader can invite.")
			return
		}
	}

	inv := &partyInvite{FromID: c.ID, FromName: c.Name, PartyID: partyID}
	h.partyInvites[target.ID] = inv
	h.send(target, protocol.TypePartyInviteMsg, protocol.PartyInvitePayload{
		FromID: c.ID, FromName: c.Name, PartyID: partyID,
	})
	h.sendSocialState(target)
}

func (h *Hub) handlePartyAccept(c *Client) {
	inv, ok := h.partyInvites[c.ID]
	if !ok {
		h.sendError(c, "No party invite to accept.")
		return
	}
	delete(h.partyInvites, c.ID)

	if _, inParty := h.clientParty[c.ID]; inParty {
		h.sendError(c, "Leave your current party first.")
		return
	}

	inviter := h.clients[inv.FromID]
	if inviter == nil || !inviter.Joined {
		h.sendError(c, "That invite has expired.")
		return
	}

	var party *hubParty
	if inv.PartyID != "" {
		party = h.parties[inv.PartyID]
	}
	if party == nil {
		h.partySeq++
		party = &hubParty{
			ID:        fmt.Sprintf("party-%d", h.partySeq),
			LeaderID:  inv.FromID,
			MemberIDs: []string{inv.FromID},
		}
		h.parties[party.ID] = party
		h.clientParty[inv.FromID] = party.ID
	}
	if len(party.MemberIDs) >= maxPartySize {
		h.sendError(c, "That party is now full.")
		return
	}
	party.MemberIDs = append(party.MemberIDs, c.ID)
	h.clientParty[c.ID] = party.ID
	h.broadcastPartySocial(party)
}

func (h *Hub) handlePartyDecline(c *Client) {
	if _, ok := h.partyInvites[c.ID]; !ok {
		return
	}
	delete(h.partyInvites, c.ID)
	h.sendSocialState(c)
}

func (h *Hub) handlePartyLeave(c *Client) {
	h.removeFromParty(c.ID, false)
}

func (h *Hub) handlePartyKick(c *Client, raw json.RawMessage) {
	var p protocol.PartyKickPayload
	if err := json.Unmarshal(raw, &p); err != nil {
		return
	}
	partyID, ok := h.clientParty[c.ID]
	if !ok {
		h.sendError(c, "You are not in a party.")
		return
	}
	party := h.parties[partyID]
	if party == nil || party.LeaderID != c.ID {
		h.sendError(c, "Only the party leader can remove members.")
		return
	}
	if p.MemberID == c.ID {
		h.sendError(c, "Use Leave to exit the party.")
		return
	}
	found := false
	for _, id := range party.MemberIDs {
		if id == p.MemberID {
			found = true
			break
		}
	}
	if !found {
		h.sendError(c, "That hero is not in your party.")
		return
	}
	h.removeFromParty(p.MemberID, true)
}

func (h *Hub) removeFromParty(clientID string, kicked bool) {
	partyID, ok := h.clientParty[clientID]
	if !ok {
		return
	}
	party := h.parties[partyID]
	if party == nil {
		delete(h.clientParty, clientID)
		return
	}

	newMembers := make([]string, 0, len(party.MemberIDs))
	for _, id := range party.MemberIDs {
		if id != clientID {
			newMembers = append(newMembers, id)
		}
	}
	delete(h.clientParty, clientID)

	h.mu.RLock()
	c := h.clients[clientID]
	h.mu.RUnlock()
	if c != nil {
		if kicked {
			h.sendError(c, "You were removed from the party.")
		}
		h.sendSocialState(c)
	}

	if len(newMembers) == 0 {
		delete(h.parties, partyID)
		return
	}

	party.MemberIDs = newMembers
	if party.LeaderID == clientID {
		party.LeaderID = newMembers[0]
	}
	h.broadcastPartySocial(party)
}

func (h *Hub) onClientDisconnectSocial(clientID string) {
	delete(h.partyInvites, clientID)
	delete(h.battleInvites, clientID)
	h.removeFromParty(clientID, false)
}

func (h *Hub) handleDeclineBattleInvite(c *Client) {
	delete(h.battleInvites, c.ID)
}

func (h *Hub) sameParty(aID, bID string) bool {
	pa, oka := h.clientParty[aID]
	pb, okb := h.clientParty[bID]
	return oka && okb && pa != "" && pa == pb
}

func (h *Hub) battleParticipantCount(battleID string) int {
	n := 0
	for _, wp := range h.world {
		if wp.InBattle && wp.BattleID == battleID {
			n++
		}
	}
	return n
}

// engagePartyMemberAt joins an in-progress battle when a party mate walks
// into a combat-locked member on the overworld.
func (h *Hub) engagePartyMemberAt(c *Client, wp *protocol.WorldPlayer, x, y float64) bool {
	if wp.InBattle || wp.InHouse {
		return false
	}
	partyID, ok := h.clientParty[c.ID]
	if !ok || partyID == "" {
		return false
	}
	party := h.parties[partyID]
	if party == nil {
		return false
	}
	for _, memberID := range party.MemberIDs {
		if memberID == c.ID {
			continue
		}
		ally := h.world[memberID]
		if ally == nil || !ally.InBattle || ally.BattleID == "" {
			continue
		}
		if !withinEngageRange(x, y, ally.X, ally.Y) {
			continue
		}
		if h.ParticipantCount(ally.BattleID) >= maxPartySize {
			continue
		}
		if err := h.combat.Join(c.ID, ally.BattleID); err == nil {
			return true
		}
	}
	return false
}

// promptPartyForBattle asks nearby party mates to opt into a fight. Anyone
// in range who skips still earns passive EXP if the party wins.
func (h *Hub) promptPartyForBattle(triggerID string, battleID string, x, y float64) {
	partyID, ok := h.clientParty[triggerID]
	if !ok {
		return
	}
	party := h.parties[partyID]
	if party == nil {
		return
	}

	meta := &battleMeta{partyID: partyID, passiveEligible: map[string]string{}}
	h.battleMeta[battleID] = meta

	participants := 0
	for _, wp := range h.world {
		if wp.InBattle && wp.BattleID == battleID {
			participants++
		}
	}

	for _, memberID := range party.MemberIDs {
		if memberID == triggerID {
			continue
		}
		wp := h.world[memberID]
		if wp == nil || wp.InBattle || wp.InHouse || battleImmune(wp) {
			continue
		}
		if dist(wp.X, wp.Y, x, y) > partyBattleRange {
			continue
		}

		h.mu.RLock()
		mc := h.clients[memberID]
		h.mu.RUnlock()
		if mc == nil {
			continue
		}
		meta.passiveEligible[memberID] = mc.Name

		if participants >= maxPartySize || h.battleInvites[memberID] != nil {
			continue
		}
		h.battleInvites[memberID] = &battleInvite{
			BattleID: battleID, FromID: triggerID, FromName: h.world[triggerID].Name,
		}
		h.send(mc, protocol.TypeBattleInviteMsg, protocol.BattleInvitePayload{
			BattleID: battleID, FromID: triggerID, FromName: h.world[triggerID].Name,
		})
	}
}
