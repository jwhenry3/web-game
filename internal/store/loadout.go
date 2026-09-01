package store

import (
	"strconv"
	"strings"

	"ffv-web-game/internal/game"
)

const hotbarSlotCount = 5

// defaultHotbar builds slot bindings for a main/sub combo: auto-attack, starter
// consumable, then each job's root skill in ActiveJobs order.
func defaultHotbar(main, sub game.JobID) map[string]HotbarBinding {
	hb := map[string]HotbarBinding{
		"1": {Kind: "skill", ID: game.BasicAttack.ID},
		"2": {Kind: "item", ID: "potion"},
	}
	slot := 3
	for _, job := range game.ActiveJobs(main, sub) {
		if slot > hotbarSlotCount {
			break
		}
		if id := game.RootSkillID(job); id != "" {
			hb[strconv.Itoa(slot)] = HotbarBinding{Kind: "skill", ID: id}
			slot++
		}
	}
	return hb
}

// JobLoadout holds equipment, hotbar, and skill progress for one main/sub combo.
type JobLoadout struct {
	Equipped    map[string]string        `json:"equipped"`
	Hotbar      map[string]HotbarBinding `json:"hotbar"`
	SkillLevels map[string]int           `json:"skill_levels"`
	SkillUsage  map[string]int           `json:"skill_usage"`
	Proficiency map[string]int           `json:"proficiency"`
}

func (l *JobLoadout) normalize() {
	if l.Equipped == nil {
		l.Equipped = map[string]string{}
	}
	if l.Hotbar == nil {
		l.Hotbar = map[string]HotbarBinding{}
	}
	if l.SkillLevels == nil {
		l.SkillLevels = map[string]int{}
	}
	if l.SkillUsage == nil {
		l.SkillUsage = map[string]int{}
	}
	if l.Proficiency == nil {
		l.Proficiency = map[string]int{}
	}
}

func (p *Profile) ComboKey() string {
	return game.JobComboKey(game.JobID(p.MainJob), game.JobID(p.SubJob))
}

func (p *Profile) MainJobLevel() int {
	if p.Jobs == nil {
		if p.Level < 1 {
			return 1
		}
		return p.Level
	}
	if prog, ok := p.Jobs[p.MainJob]; ok && prog.Level > 0 {
		return prog.Level
	}
	return 1
}

func (p *Profile) JobLevel(job game.JobID) int {
	if p.Jobs == nil {
		return 1
	}
	if prog, ok := p.Jobs[string(job)]; ok && prog.Level > 0 {
		return prog.Level
	}
	return 1
}

func (p *Profile) SubJobEffectiveLevel() int {
	if p.SubJob == "" {
		return 0
	}
	return game.SubjobEffectiveLevel(p.MainJobLevel(), p.JobLevel(game.JobID(p.SubJob)))
}

func (p *Profile) MainCategory() game.Category {
	return game.JobCategory(game.JobID(p.MainJob))
}

func (p *Profile) SubCategory() game.Category {
	if p.SubJob == "" {
		return ""
	}
	return game.JobCategory(game.JobID(p.SubJob))
}

func (p *Profile) ActiveLoadout() *JobLoadout {
	p.ensureLoadout()
	l := p.Loadouts[p.ComboKey()]
	return &l
}

func (p *Profile) ensureLoadout() {
	if p.Loadouts == nil {
		p.Loadouts = map[string]JobLoadout{}
	}
	key := p.ComboKey()
	if _, ok := p.Loadouts[key]; !ok {
		p.Loadouts[key] = p.newLoadout()
	}
	l := p.Loadouts[key]
	l.normalize()
	migrateProficiencyToJobs(&l, game.JobID(p.MainJob), game.JobID(p.SubJob))
	p.syncWeaponSlots(&l)
	p.Loadouts[key] = l
}

func (p *Profile) syncWeaponSlots(l *JobLoadout) {
	if p.SubJob == "" {
		delete(l.Equipped, game.SlotSubWeapon)
	}
	if l.Equipped[game.SlotWeapon] == "" {
		if id := findWeaponInInventory(p.Inventory, game.JobWeapon(game.JobID(p.MainJob))); id != "" {
			l.Equipped[game.SlotWeapon] = id
		}
	}
	if p.SubJob != "" && l.Equipped[game.SlotSubWeapon] == "" {
		if id := findWeaponInInventory(p.Inventory, game.JobWeapon(game.JobID(p.SubJob))); id != "" {
			l.Equipped[game.SlotSubWeapon] = id
		}
	}
}

func migrateProficiencyToJobs(l *JobLoadout, mainJob, subJob game.JobID) {
	if l.Proficiency == nil {
		return
	}
	if _, ok := l.Proficiency[string(mainJob)]; ok {
		return
	}
	legacyCats := map[string]bool{"swordplay": true, "stealth": true, "sorcery": true, "devotion": true}
	hasLegacy := false
	for k := range l.Proficiency {
		if legacyCats[k] {
			hasLegacy = true
			break
		}
	}
	if !hasLegacy {
		return
	}
	mainCat := string(game.JobCategory(mainJob))
	subCat := ""
	if subJob != "" {
		subCat = string(game.JobCategory(subJob))
	}
	newProf := map[string]int{}
	if pts, ok := l.Proficiency[mainCat]; ok {
		newProf[string(mainJob)] = pts
	}
	if subJob != "" {
		if pts, ok := l.Proficiency[subCat]; ok {
			newProf[string(subJob)] = pts
		}
	}
	l.Proficiency = newProf
}

func (p *Profile) newLoadout() JobLoadout {
	l := JobLoadout{
		Equipped:    map[string]string{},
		Hotbar:      defaultHotbar(game.JobID(p.MainJob), game.JobID(p.SubJob)),
		SkillLevels: map[string]int{},
		SkillUsage:  map[string]int{},
		Proficiency: map[string]int{},
	}
	mainWeapon := game.JobWeapon(game.JobID(p.MainJob))
	if id := findWeaponInInventory(p.Inventory, mainWeapon); id != "" {
		l.Equipped[game.SlotWeapon] = id
	}
	if p.SubJob != "" {
		subWeapon := game.JobWeapon(game.JobID(p.SubJob))
		if id := findWeaponInInventory(p.Inventory, subWeapon); id != "" {
			l.Equipped[game.SlotSubWeapon] = id
		}
	}
	return l
}

func (p *Profile) grantJobWeaponIfMissing(job game.JobID) {
	if job == "" {
		return
	}
	weapon := game.JobWeapon(job)
	if findWeaponInInventory(p.Inventory, weapon) != "" {
		return
	}
	starter := game.StarterWeapon(weapon)
	starter.ID = "starter-" + strings.ToLower(string(job)) + "-" + string(weapon)
	p.Inventory = append(p.Inventory, starter)
}

func findWeaponInInventory(inv []game.Item, weapon game.WeaponType) string {
	for _, item := range inv {
		if item.Kind == game.KindEquipment && item.Slot == game.SlotWeapon && item.Type == string(weapon) {
			return item.ID
		}
	}
	return ""
}

func (p *Profile) syncLegacyLevel() {
	p.Level = p.MainJobLevel()
	if p.Jobs != nil {
		if prog, ok := p.Jobs[p.MainJob]; ok {
			p.XP = prog.XP
		}
	}
}

func (p *Profile) migrateJobs() {
	if p.Jobs != nil && len(p.Jobs) > 0 {
		if p.MainJob == "" {
			p.MainJob = string(game.JobWAR)
		}
		if p.Loadouts == nil {
			p.Loadouts = map[string]JobLoadout{}
		}
		p.grantJobWeaponIfMissing(game.JobID(p.MainJob))
		if p.SubJob != "" {
			p.grantJobWeaponIfMissing(game.JobID(p.SubJob))
		}
		p.ensureLoadout()
		p.SyncSkillUnlocks()
		p.syncLegacyLevel()
		return
	}

	mainJob := game.JobID(p.MainJob)
	if mainJob == "" {
		mainJob = game.WeaponDefaultJob(p.WeaponType())
	}
	oldLevel := p.Level
	if oldLevel < 1 {
		oldLevel = 1
	}
	oldXP := p.XP

	p.Jobs = map[string]game.JobProgress{}
	for _, def := range game.AllJobs() {
		p.Jobs[string(def.ID)] = game.JobProgress{Level: 1, XP: 0}
	}
	p.Jobs[string(mainJob)] = game.JobProgress{Level: oldLevel, XP: oldXP}
	p.MainJob = string(mainJob)
	if p.SubJob == "" {
		p.SubJob = ""
	}

	skillLevels := map[string]int{}
	for _, id := range p.UnlockedSkills {
		skillLevels[id] = 1
	}
	key := game.JobComboKey(mainJob, game.JobID(p.SubJob))
	p.Loadouts = map[string]JobLoadout{
		key: {
			Equipped:    cloneStringMap(p.Equipped),
			Hotbar:      cloneHotbar(p.Hotbar),
			SkillLevels: skillLevels,
			SkillUsage:  map[string]int{},
			Proficiency: cloneIntMap(p.Proficiency),
		},
	}
	p.ensureLoadout()
	p.SyncSkillUnlocks()
	p.syncLegacyLevel()
}

func cloneStringMap(m map[string]string) map[string]string {
	if m == nil {
		return map[string]string{}
	}
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func cloneIntMap(m map[string]int) map[string]int {
	if m == nil {
		return map[string]int{}
	}
	out := make(map[string]int, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

func cloneHotbar(m map[string]HotbarBinding) map[string]HotbarBinding {
	if m == nil {
		return map[string]HotbarBinding{}
	}
	out := make(map[string]HotbarBinding, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// SkillLevel returns the current level of a skill in the active loadout (0 = locked).
func (p Profile) SkillLevel(id string) int {
	if id == game.BasicAttack.ID {
		return 1
	}
	l := p.ActiveLoadout()
	if lvl, ok := l.SkillLevels[id]; ok {
		return lvl
	}
	return 0
}

func (p Profile) HasSkill(id string) bool {
	return p.SkillLevel(id) > 0
}

func (p Profile) skillPrereqMet(skill game.Skill, levels map[string]int) bool {
	if skill.Prereq == "" {
		return true
	}
	return levels[skill.Prereq] > 0
}

func (p Profile) skillJobLevel(job game.JobID) int {
	if job == game.JobID(p.MainJob) {
		return p.MainJobLevel()
	}
	if p.SubJob != "" && job == game.JobID(p.SubJob) {
		return p.SubJobEffectiveLevel()
	}
	return 0
}

func (p Profile) skillAccessibleJob(job game.JobID) bool {
	return p.skillJobLevel(job) > 0
}

func (p Profile) ActiveJobIDs() []game.JobID {
	return game.ActiveJobs(game.JobID(p.MainJob), game.JobID(p.SubJob))
}

// SyncSkillUnlocks grants level-1 skills that meet job level and prereq gates.
func (p *Profile) SyncSkillUnlocks() {
	l := p.ActiveLoadout()
	for _, sk := range game.Catalog {
		if !p.skillAccessibleJob(sk.Job) {
			continue
		}
		if p.skillJobLevel(sk.Job) < game.SkillUnlockLevel(sk.ID) {
			continue
		}
		if !p.skillPrereqMet(sk, l.SkillLevels) {
			continue
		}
		if l.SkillLevels[sk.ID] < 1 {
			l.SkillLevels[sk.ID] = 1
		}
	}
	p.Loadouts[p.ComboKey()] = *l
}

// AvailableSkillPoints removed — skills level through battle use only.

func (p Profile) EquippedItems() []game.Item {
	l := p.ActiveLoadout()
	var out []game.Item
	for _, id := range l.Equipped {
		for _, item := range p.Inventory {
			if item.ID == id {
				out = append(out, item)
				break
			}
		}
	}
	return out
}

func (p Profile) WeaponType() game.WeaponType {
	return p.equippedWeaponType(game.SlotWeapon, game.JobID(p.MainJob))
}

func (p Profile) SubWeaponType() game.WeaponType {
	if p.SubJob == "" {
		return ""
	}
	return p.equippedWeaponType(game.SlotSubWeapon, game.JobID(p.SubJob))
}

func (p Profile) equippedWeaponType(slot string, job game.JobID) game.WeaponType {
	l := p.ActiveLoadout()
	id, ok := l.Equipped[slot]
	if !ok {
		return game.JobWeapon(job)
	}
	for _, item := range p.Inventory {
		if item.ID == id {
			return game.WeaponType(item.Type)
		}
	}
	return game.JobWeapon(job)
}

func awardXP(prog *game.JobProgress, xp int) int {
	if xp < 1 {
		return 0
	}
	levels := 0
	prog.XP += xp
	for prog.Level < game.LevelCap && prog.XP >= game.XPToNext(prog.Level) {
		prog.XP -= game.XPToNext(prog.Level)
		prog.Level++
		levels++
	}
	if prog.Level >= game.LevelCap {
		prog.Level = game.LevelCap
		if prog.XP > game.XPToNext(game.LevelCap) {
			prog.XP = game.XPToNext(game.LevelCap)
		}
	}
	return levels
}

func applySkillUsage(l *JobLoadout, skillID string, uses int) {
	if uses < 1 {
		return
	}
	l.SkillUsage[skillID] += uses
	lvl := l.SkillLevels[skillID]
	if lvl < 1 {
		return
	}
	for lvl < game.SkillMaxLevel {
		needed := game.SkillUsagePerLevel * lvl
		if l.SkillUsage[skillID] < needed {
			break
		}
		lvl++
		l.SkillLevels[skillID] = lvl
	}
}

func normalizeJobID(id string) string {
	return strings.ToUpper(strings.TrimSpace(id))
}
