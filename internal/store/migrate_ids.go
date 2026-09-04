package store

import "clara-mundi/internal/game"

var legacyRaceIDs = map[string]string{
	"hume":     string(game.RaceHumanus),
	"elvaan":   string(game.RaceAltus),
	"tarutaru": string(game.RaceParvus),
	"mithra":   string(game.RaceFelis),
	"galka":    string(game.RaceSaxum),
}

// nicheAliasMain maps retired / FF ids onto a core (and optional sub unlock).
var nicheAliasMain = map[string]struct{ Main, Sub string }{
	"SPL": {Main: string(game.JobVAN), Sub: string(game.JobHEX)},
	"SHD": {Main: string(game.JobCUT), Sub: string(game.JobHEX)},
	"ECH": {Main: string(game.JobCAN), Sub: string(game.JobHEX)},
	"SIG": {Main: string(game.JobVAN), Sub: string(game.JobCAN)},
	"NVE": {Main: string(game.JobCUT), Sub: string(game.JobCAN)},
	"BEW": {Main: string(game.JobBRW), Sub: string(game.JobCAN)},
	"MRK": {Main: string(game.JobCUT), Sub: string(game.JobLNC)},
	"PVT": {Main: string(game.JobCUT), Sub: string(game.JobBRW)},
	"REV": {Main: string(game.JobCAN), Sub: string(game.JobCUT)}, // old Reveler → not Reaver
	"CNJ": {Main: string(game.JobHEX), Sub: string(game.JobSAN)},
	"LEY": {Main: string(game.JobHEX), Sub: string(game.JobCAN)},
	"LOR": {Main: string(game.JobSAN), Sub: string(game.JobCAN)},
	"ART": {Main: string(game.JobBRW), Sub: string(game.JobSAN)},
	"PLD": {Main: string(game.JobAEG), Sub: string(game.JobSAN)},
	"DRK": {Main: string(game.JobCUT), Sub: string(game.JobHEX)},
	"SAM": {Main: string(game.JobRON)},
	"DRG": {Main: string(game.JobLNC)},
	"BLU": {Main: string(game.JobCAN), Sub: string(game.JobHEX)},
	"RUN": {Main: string(game.JobVAN), Sub: string(game.JobCAN)},
	"NIN": {Main: string(game.JobCUT), Sub: string(game.JobCAN)},
	"BST": {Main: string(game.JobBRW), Sub: string(game.JobCAN)},
	"RNG": {Main: string(game.JobCUT), Sub: string(game.JobLNC)},
	"COR": {Main: string(game.JobCUT), Sub: string(game.JobBRW)},
	"DNC": {Main: string(game.JobCAN), Sub: string(game.JobCUT)},
	"SMN": {Main: string(game.JobHEX), Sub: string(game.JobSAN)},
	"GEO": {Main: string(game.JobHEX), Sub: string(game.JobCAN)},
	"SCH": {Main: string(game.JobSAN), Sub: string(game.JobCAN)},
	"PUP": {Main: string(game.JobBRW), Sub: string(game.JobSAN)},
	"RDM": {Main: string(game.JobVAN), Sub: string(game.JobHEX)},
	"WHM": {Main: string(game.JobSAN)},
	"BLM": {Main: string(game.JobHEX)},
	"BRD": {Main: string(game.JobCAN)},
	"THF": {Main: string(game.JobCUT)},
	"MNK": {Main: string(game.JobBRW)},
	"WAR": {Main: string(game.JobVAN)},
	"GRD": {Main: string(game.JobAEG)},
	"SWM": {Main: string(game.JobRON)},
	"MIM": {Main: string(game.JobCAN), Sub: string(game.JobHEX)},
	"RNK": {Main: string(game.JobVAN), Sub: string(game.JobCAN)},
	"ASN": {Main: string(game.JobCUT), Sub: string(game.JobCAN)},
	"PIR": {Main: string(game.JobCUT), Sub: string(game.JobBRW)},
	"WMG": {Main: string(game.JobHEX)},
	"HLR": {Main: string(game.JobSAN)},
	"ROG": {Main: string(game.JobCUT)},
	"EMG": {Main: string(game.JobHEX), Sub: string(game.JobCAN)},
}

var legacySkillIDs = map[string]string{
	"reditus":   game.SkillIDReturn,
	"porta":     game.SkillIDPort,
	"teleport":  game.SkillIDPort,
	"potion":    "potio",
	"hi_potion": "potio_maior",
	"ether":     "aether",
}

var legacyWeaponTypes = map[string]string{
	"mace": "hammer",
}

func mapLegacyID(id string, table map[string]string) string {
	if id == "" {
		return id
	}
	if next, ok := table[id]; ok {
		return next
	}
	return id
}

func mapLegacyJob(id string) (main string, unlockSub string) {
	if id == "" {
		return "", ""
	}
	if pair, ok := nicheAliasMain[id]; ok {
		return pair.Main, pair.Sub
	}
	if game.ValidJob(game.JobID(id)) {
		return id, ""
	}
	return string(game.JobVAN), ""
}

func (p *Profile) migrateClaraMundiIDs() {
	p.Race = mapLegacyID(p.Race, legacyRaceIDs)

	extraUnlocks := map[string]bool{}
	main, subFromMain := mapLegacyJob(p.MainJob)
	p.MainJob = main
	if subFromMain != "" {
		extraUnlocks[subFromMain] = true
	}
	if p.SubJob != "" {
		sub, subPair := mapLegacyJob(p.SubJob)
		p.SubJob = sub
		if subPair != "" {
			extraUnlocks[subPair] = true
		}
	}

	if len(p.UnlockedJobs) > 0 {
		seen := map[string]bool{}
		out := make([]string, 0, len(p.UnlockedJobs))
		for _, j := range p.UnlockedJobs {
			nj, pair := mapLegacyJob(j)
			if nj != "" && !seen[nj] {
				seen[nj] = true
				out = append(out, nj)
			}
			if pair != "" {
				extraUnlocks[pair] = true
			}
		}
		for id := range extraUnlocks {
			if !seen[id] {
				seen[id] = true
				out = append(out, id)
			}
		}
		p.UnlockedJobs = out
	}

	if p.Jobs != nil {
		next := make(map[string]game.JobProgress, len(p.Jobs))
		for id, prog := range p.Jobs {
			nid, _ := mapLegacyJob(id)
			if prev, ok := next[nid]; ok {
				if prog.Level > prev.Level || (prog.Level == prev.Level && prog.XP > prev.XP) {
					next[nid] = prog
				}
				continue
			}
			next[nid] = prog
		}
		p.Jobs = next
	}

	if p.Loadouts != nil {
		next := make(map[string]JobLoadout, len(p.Loadouts))
		for key, lo := range p.Loadouts {
			parts := splitComboKey(key)
			mainID, _ := mapLegacyJob(parts[0])
			subID := ""
			if len(parts) > 1 && parts[1] != "" {
				subID, _ = mapLegacyJob(parts[1])
			}
			nk := game.JobComboKey(game.JobID(mainID), game.JobID(subID))
			lo.migrateLegacySkillMaps()
			if prev, ok := next[nk]; ok {
				mergeLoadout(&prev, lo)
				next[nk] = prev
			} else {
				next[nk] = lo
			}
		}
		p.Loadouts = next
	}

	for i := range p.UnlockedSkills {
		p.UnlockedSkills[i] = mapLegacyID(p.UnlockedSkills[i], legacySkillIDs)
	}
	for i := range p.Inventory {
		if p.Inventory[i].Consumable != "" {
			p.Inventory[i].Consumable = mapLegacyID(p.Inventory[i].Consumable, legacySkillIDs)
		}
		if p.Inventory[i].Type != "" {
			p.Inventory[i].Type = mapLegacyID(p.Inventory[i].Type, legacyWeaponTypes)
		}
	}
}

func splitComboKey(key string) []string {
	if key == "" {
		return []string{""}
	}
	for i := 0; i < len(key); i++ {
		if key[i] == '/' {
			return []string{key[:i], key[i+1:]}
		}
	}
	return []string{key}
}

func (l *JobLoadout) migrateLegacySkillMaps() {
	if l.Hotbar != nil {
		for slot, b := range l.Hotbar {
			b.ID = mapLegacyID(b.ID, legacySkillIDs)
			l.Hotbar[slot] = b
		}
	}
	if l.SkillLevels != nil {
		next := make(map[string]int, len(l.SkillLevels))
		for id, lv := range l.SkillLevels {
			nid := mapLegacyID(id, legacySkillIDs)
			if prev, ok := next[nid]; !ok || lv > prev {
				next[nid] = lv
			}
		}
		l.SkillLevels = next
	}
	if l.SkillUsage != nil {
		next := make(map[string]int, len(l.SkillUsage))
		for id, n := range l.SkillUsage {
			nid := mapLegacyID(id, legacySkillIDs)
			next[nid] += n
		}
		l.SkillUsage = next
	}
}

func mergeLoadout(dst *JobLoadout, src JobLoadout) {
	if dst.Equipped == nil {
		dst.Equipped = map[string]string{}
	}
	for k, v := range src.Equipped {
		if dst.Equipped[k] == "" {
			dst.Equipped[k] = v
		}
	}
	if dst.Hotbar == nil {
		dst.Hotbar = map[string]HotbarBinding{}
	}
	for k, v := range src.Hotbar {
		if _, ok := dst.Hotbar[k]; !ok {
			dst.Hotbar[k] = v
		}
	}
	if dst.SkillLevels == nil {
		dst.SkillLevels = map[string]int{}
	}
	for k, v := range src.SkillLevels {
		if v > dst.SkillLevels[k] {
			dst.SkillLevels[k] = v
		}
	}
	if dst.SkillUsage == nil {
		dst.SkillUsage = map[string]int{}
	}
	for k, v := range src.SkillUsage {
		dst.SkillUsage[k] += v
	}
}
