# Game Design Document — Lore & World Architecture

This document defines the **setting**, **three mother cities**, **Champion Mandate**, and the **world-systems architecture** (calendar, day/night, Evil Presence) that gameplay and config will follow.

Related docs: [ARCHITECTURE.md](./ARCHITECTURE.md) (tech stack), [SYSTEMS.md](./SYSTEMS.md) (current combat/jobs rules), [GAME_DESIGNER.md](./GAME_DESIGNER.md) (content tools).

---

## 1. High concept

Every month, a recurring metaphysical pressure known as the **Evil Presence** (also called the Tide, the Blight Veil, or simply **the Presence**) swells across the land. It is not a single villain with a throne—it is a **seasonal force of nature**: when it rises, wildlife turns vicious, beastfolk lose their bearings, and **demons** and **undead** bleed into the waking world.

Civilization holds because three great regions still honor the **Champion Mandate**: each month they select and send **Champions** to hunt, hold, and thin the Presence’s manifestations before attrition breaks towns, roads, and the fragile peace between peoples.

The player is (or becomes) one of those Champions.

---

## 2. Tone & pillars

| Pillar | Intent |
|--------|--------|
| **Civic duty** | Heroes are chosen; regions compete in pride but share survival |
| **Natural horror** | The Presence feels like weather and season, not only “boss fights” |
| **Regional identity** | Starting city shapes culture, aesthetics, and first job options |
| **Readable cycles** | Day/night and monthly Presence are predictable enough to plan around |

---

## 3. The three mother cities & regions

Maps today: **18 playable zones** across three regions (6 each). Lore seats are **Greenwood**, **Frostkeep**, and **Tide Court**; satellite maps inherit the world clock / Presence rules with local spawn tables.

### 3.1 Greenwood — The Verdant March

**Seat:** Greenwood (temperate forest marches, timber roads, crystal sanctuaries under the canopy). Field zones: Timber Road, Deep Canopy, Willowford, Sanctuary Grove, Northwatch March.

**Culture:** Communal, covenant-bound, wary of hubris. The wood is livelihood and scripture. Wardens and healers keep the March “green” in both ecology and law. Outsiders are welcome if they respect sanctuary stones and the Mandate rolls.

**Influence:** Soft power through grain, timber, and moral authority; hosts many Mandate councils because it is easiest to reach.

**Starting jobs (culture fit):**

| Class | Why here |
|-------|----------|
| **Vanguard (VAN)** | *Green Wardens* — sword oaths to roads, villages, and sanctuary borders |
| **Sanctifier (SAN)** | *Covenant of Light* — wand healers of the canopy temples |

**Advanced cores / aliases:** Aegis (hammer tank), Lorekeeper (SAN/CAN), Beastward (BRW/CAN).

**Combat feel (current tech):** realtime maps suit dense forest skirmishes.

---

### 3.2 Frostkeep — The Frost Bastion

**Seat:** Frostkeep (stone keep, wind-scoured ice flats, monastic towers on ridgelines). Field zones: Windswept Flats, Icehollow Crags, Stillstone Monastery, Cairnwatch, Frostmarch Gate.

**Culture:** Austere, pragmatic, proud of endurance. Magic that others call reckless is studied here as a necessary weapon. The Bastion believes the Presence is weakest when met with discipline and overwhelming force.

**Influence:** Military and ritual expertise; supplies many “front-line” Champions when the Presence peaks.

**Starting jobs (culture fit):**

| Class | Why here |
|-------|----------|
| **Brawler (BRW)** | *Orders of Still Stone* — knuckles as fortress against cold and corruption |
| **Hexwright (HEX)** | *Stormbind Circle* — staff arts taught under oath to burn what the Presence births |

**Advanced cores / aliases:** Ronin (katana), Lancer (spear), Reaver (axe), Sigilblade (VAN/CAN).

**Combat feel (current tech):** ATB suits measured, harsh frontier engagements.

---

### 3.3 Tide Court — The Tide Courts

**Seat:** Tide Court (harbor city, cliff academies, markets that never fully sleep). Field zones: Brine Coast, Dunesreach, Red Sash Quay, Cliffhaven, West Wharf Road.

**Culture:** Cosmopolitan, mercantile, theatrical. Status comes from wit, contracts, and adaptable craft. The Shore funds the Mandate with coin and ships; its Champions are often duelists, scouts, and red-sashed academy graduates.

**Influence:** Trade leagues, privateer letters, and information networks along the coast.

**Starting jobs (culture fit):**

| Class | Why here |
|-------|----------|
| **Cutpurse (CUT)** | *Harbor Hands* — dagger scouts and Mandate “quiet work” on docks |
| **Cantor (CAN)** | *Tide Academies* — wand hymns and coastal performance craft |

**Advanced cores / aliases:** Spellblade (VAN/HEX), Privateer (CUT/BRW), Duelist (RON/CUT), Nightveil (CUT/CAN).

**Combat feel (current tech):** realtime suits chaotic shore fights and ambushes.

---

### 3.4 Regional maps & connectivity

Clara Mundi’s overworld is an **FFXI-style zone web**: walk contiguous edges within and between neighboring regions; use a **Mandate ferry** for the non-contiguous Frost ↔ Tide link.

```text
                    Icehollow Crags
                           |
        Cairnwatch — Windswept Flats — Stillstone Monastery
                           |
                      Frostkeep ★
                           |
                    Frostmarch Gate
                      ║ contiguous border
                    Northwatch March
                           |
        Sanctuary Grove — Timber Road
               |               |
          Willowford — Greenwood ★ — Deep Canopy
                                          |
                                    West Wharf Road
                                      ║ contiguous border
        Cliffhaven — Brine Coast — Tide Court ★ — Dunesreach
                           |              |
                      (harbor)       Red Sash Quay

Non-contiguous: Frostkeep ferry ↔ Tide Court ferry (Mandate boat)
```

| Region | Mother city (hub) | Minor towns / settlements | Field / border zones |
|--------|-------------------|---------------------------|----------------------|
| Verdant March | `greenwood` | `willowford`, `sanctuarygrove` (+ camps on `timberroad`, `deepcanopy`, `northwatch`) | `timberroad`, `deepcanopy`, `northwatch` |
| Frost Bastion | `frostkeep` | `stillstone`, `cairnwatch` (+ shelters on `windswept`, `icehollow`, `frostmarch`) | `windswept`, `icehollow`, `frostmarch` |
| Tide Courts | `tidecourt` | `redsash`, `cliffhaven` (+ stops on `brinecoast`, `dunesreach`, `westwharf`) | `brinecoast`, `dunesreach`, `westwharf` |

**Borders**

| Transition | Type | Maps |
|------------|------|------|
| Verdant ↔ Frost | Contiguous land | `northwatch` ↔ `frostmarch` |
| Verdant ↔ Tide | Contiguous land | `deepcanopy` ↔ `westwharf` |
| Frost ↔ Tide | Non-contiguous ferry | `frostkeep` ↔ `tidecourt` |

Regenerate stock world: `go run ./cmd/genworld`.

### 3.5 Starting-city summary

| Region | Hub map id | Starters | Cultural one-liner |
|--------|------------|----------|--------------------|
| Verdant March | `greenwood` | VAN, SAN | Duty under the green canopy |
| Frost Bastion | `frostkeep` | BRW, HEX | Endurance and black fire |
| Tide Courts | `tidecourt` | CUT, CAN | Coin, cunning, and academy song |

Character creation: player picks a **mother city** first; available **starting jobs** are filtered to that city’s list. Job Masters elsewhere can still unlock the full roster later (existing unlock / job-change systems).

---

## 4. The Champion Mandate

### 4.1 Story spine

1. **The Presence always returns.** Roughly once per civil month it swells, peaks, and fades. History argues about *why*; faiths disagree; scholars measure it.
2. **Losses compound.** Unchecked, roads close, herds go feral, undead choke night travel, and demon-tide days empty border villages.
3. **Three regions share the burden.** Each selects Champions (volunteer, lottery, noble charge, or hired writ—flavor by city). The Mandate is the political instrument that keeps rivalry from becoming civil war.
4. **The player’s arc** begins as a new Champion of one mother city, learning local culture before the first serious crest of the Presence.

### 4.2 What “winning a month” means (design intent)

- Thin elite manifestations, close rifts, protect sanctuaries, complete monthly Mandate quests.
- Failure state is **civilization attrition** (narrative + systemic): worse spawn tables next crest, temporary loss of safe roads, economic pressure—not a hard wipe of the shard on day one.

---

## 5. The Evil Presence (lore)

The Presence is a **pressure field**, not a person:

- **Wildlife / beasts:** aggression up, packs larger, “normal” fauna can carry corruption tags.
- **Beastfolk:** lore treats them as peoples under strain—NPC factions may turn hostile or seek sanctuary depending on Presence strength and region politics (content TBD).
- **Demons:** bleed through when the field is high; certain weekdays intensify their abundance.
- **Undead:** night always favors them; the Presence modulates how *strong* and how *dense* they are.

When the Presence fades, demons thin, corrupted wildlife calm, and undead remain a night hazard at baseline strength.

---

## 6. World clock architecture

This section is the **design contract** for future config and server systems. Implementation can land incrementally; names below are proposed APIs/config keys.

### 6.1 Real time → game time

| Real time | Game time |
|-----------|-----------|
| **60 real minutes** | **1 full game day** (day + night) |
| **30 real days** (configurable) | **1 civil month** / one Presence cycle |

**Day / night**

- One real hour = one game day.
- Split within that hour is configurable (default **50/50**: 30 real minutes day, 30 night), or dawn/dusk shoulders later.
- Server owns authoritative `world_time` (epoch + offsets); clients interpolate for lighting/UI.

Suggested broadcast: `world_clock` envelope with `day_index`, `month_index`, `phase` (`day` \| `night`), `day_progress` (0–1), `presence` (0–1).

### 6.2 Evil Presence curve (monthly)

Presence is a **scalar** `P ∈ [min, max]` over the civil month.

```text
Month progress ──► envelope curve ──► clamp(min, max) ──► P
```

**Config knobs (balancing):**

| Key | Role |
|-----|------|
| `presence.min` | Floor while “quiet” (e.g. `0.05`) |
| `presence.max` | Ceiling at crest (e.g. `1.0`) |
| `presence.cycle_days` | Civil days per cycle (default `30`) |
| `presence.rise_start` | Day index when climb begins |
| `presence.peak_start` / `presence.peak_end` | High plateau window |
| `presence.fade_end` | Day index when back to floor |
| `presence.curve` | `linear` \| `smoothstep` \| piecewise |

Example sketch (`data/world.json` or cluster-level `world` block):

```json
{
  "clock": {
    "real_minutes_per_game_day": 60,
    "day_fraction": 0.5,
    "civil_days_per_month": 30
  },
  "presence": {
    "min": 0.05,
    "max": 1.0,
    "rise_start": 8,
    "peak_start": 12,
    "peak_end": 18,
    "fade_end": 24,
    "curve": "smoothstep"
  }
}
```

Designers tune **min/max** and window days without code changes.

### 6.3 Seasonal / weekly modulation

On top of `P`, **enemy families** get multipliers from schedule tables:

| Family | Baseline | Schedule hooks | Presence hook |
|--------|----------|----------------|---------------|
| **Demons** | Rare at low `P` | **Abundant** on configured weekdays (e.g. two days per civil week) | Spawn weight × `f_demon(P)` |
| **Undead** | **Always eligible at night** | Daytime heavily suppressed | Night power/HP/count × `f_undead(P)` |
| **Corrupted wildlife / beasts** | Always possible | Region biome tables | Aggression & pack size × `f_wild(P)` |
| **Beastfolk (hostile)** | Content-driven | Region politics | Hostility threshold vs `P` |

“Week” = 7 civil days within the month clock (not real weekdays unless we sync intentionally—**prefer civil week** so shards stay deterministic).

### 6.4 How spawn & combat consume the clock

```text
world clock
   ├─ phase (day/night)     → undead eligibility, lighting, some skills later
   ├─ civil weekday         → demon abundance windows
   └─ presence P            → weights, stat scales, optional loot/Mandate intensity
         │
         ▼
   encounter / patrol spawn (per map + region)
         │
         ▼
   combat plugins (ATB / realtime) — enemy templates already support level ranges & drop pools
```

**Recommended hooks (implementation order):**

1. Authoritative clock + `world_clock` sync.
2. Presence scalar from config curve.
3. Spawn weight filters (demon / undead / wildlife tags on entities or drop into encounter `enemyTypes`).
4. Stat scales at spawn (`level` or HP/str multipliers from `P` and night).
5. Mandate / seasonal UI (crest warnings, city banners).

Existing **encounter config** and **drop pools** on combat NPCs remain the per-spawn authoring layer; the world clock supplies **global modifiers**, not a replacement for designer tables.

---

## 7. Regional architecture vs tech architecture

| Lore concept | Tech mapping (current / planned) |
|--------------|----------------------------------|
| Mother city | Map node (`greenwood`, `frostkeep`, `tidecourt`) + character `origin_city` |
| Starting jobs by city | Filter `starting: true` jobs by origin; persist on profile |
| Sanctuaries / crystals | Existing sanctuary + save-point rules |
| Presence crest | Config-driven `P`; Hub consults before NPC respawn / encounter rolls |
| Day/night | Shared clock service in `internal/host` or `internal/game`; all map nodes read same clock |
| Demons / undead / wildlife | Enemy `kind` tags or content catalog fields; spawn rules reference tags |
| Champion Mandate | Quests / seasonal objectives catalog (future); UI + rewards |

Cluster remains the **multiplayer spine** ([ARCHITECTURE.md](./ARCHITECTURE.md)); the world clock should be **cluster-global** so all maps share one sky and one Presence crest.

---

## 8. Open design questions (intentionally deferred)

- Exact weekday list for demon abundance (civil days 5–6 vs configurable pairs).
- Whether beastfolk are playable, NPC-only, or both.
- How Mandate selection is shown in UI (letter, NPC, automatic enrollment).
- Whether failing a crest applies permanent world scars or only that month’s modifiers.
- Naming pass: keep hub ids (`greenwood` / `frostkeep` / `tidecourt`) as in-world names, or add poetic titles only in lore UI.

---

## 9. Acceptance checklist (for later implementation)

- [ ] Character create: choose one of three mother cities; only that city’s starters appear.
- [ ] Server clock: 60 real minutes = 1 game day; night flag authoritative.
- [ ] Presence `P` rises/fades each civil month; clamped to config min/max.
- [ ] Undead: night baseline always; strength scales with `P`.
- [ ] Demons: spawn weight spikes on configured civil weekdays and with `P`.
- [ ] Wildlife/beast corruption scales with `P`.
- [ ] Clients show time-of-day and Presence intensity (at least a simple meter).

---

## 10. Document history

| Date | Note |
|------|------|
| 2026-09-04 | Initial lore + world-clock architecture; starters bound to Greenwood / North / Eastern Shore |
| 2026-09-04 | Class IDs aligned to English names (WAR/HLR/WMG/ROG/…); legacy VAN/HEX/CUT and FF abbrs migrate on load |
| 2026-09-04 | World restructure: 18 maps (6/region), contiguous borders + Mandate ferry; hubs Greenwood / Frostkeep / Tide Court |
| 2026-09-04 | Housing v1: Camp field skill, house instance (20×20 walkable in 100×100), storage + furniture place/pick |
