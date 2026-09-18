package store

import (
	"fmt"

	"clara-mundi/internal/game"
)

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

func (s *Store) FindItem(name, itemID string) (game.Item, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
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
	if !game.ValidHotbarSlot(slot) {
		return *p, false
	}
	if kind != "" && !game.HotbarBindable(kind, id) {
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

// AddBattleTraining records rolled proficiency growth (hundredths of a
// point per discipline) for the active combo.
func (s *Store) AddBattleTraining(name string, profGrowth map[string]int) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	l := p.ActiveLoadout()
	changed := false
	for prof, growth := range profGrowth {
		if growth > 0 {
			applyProficiencyGrowth(l, prof, growth)
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
// Memory is always updated; flush=true requests the urgent (~750ms)
// debounced write, otherwise the position lands on disk on the lazy
// (~5s) cadence or piggybacks on the next urgent flush. When mapID
// changes, the previous MapID is retained in PrevMapID.
// Singular-world hubs should use SetWorldLocationInWorld instead.
func (s *Store) SetWorldLocation(name, mapID string, x, y float64, facing float64, flush bool) (Profile, bool) {
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
	p.Facing = game.FacingYaw(facing)
	p.HasWorldPos = true
	if flush {
		s.save()
	} else {
		s.saveLazy()
	}
	return *p, true
}

// SetWorldLocationInWorld stores the hero's overworld position inside a
// singular world. Unlike SetWorldLocation it records worldID in WorldID and
// leaves MapID/PrevMapID untouched — a world hub never transfers between maps,
// so there is no previous map to retain and a stale legacy MapID must not
// control world selection later.
func (s *Store) SetWorldLocationInWorld(name, worldID string, x, y float64, facing float64, flush bool) (Profile, bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, false
	}
	if worldID != "" {
		p.WorldID = worldID
	}
	p.WorldX = x
	p.WorldY = y
	p.Facing = game.FacingYaw(facing)
	p.HasWorldPos = true
	if flush {
		s.save()
	} else {
		s.saveLazy()
	}
	return *p, true
}
