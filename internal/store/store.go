package store

import (
	"encoding/json"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"clara-mundi/internal/game"
)

// saveDebounce is the quiet period after the last mutation before the
// background flusher writes profiles.json.
const saveDebounce = 750 * time.Millisecond

// lazySaveInterval is the flush cadence for low-urgency writes (position
// updates from movement). They also piggyback on any urgent flush, which
// writes the full snapshot and so clears both dirty flags.
const lazySaveInterval = 5 * time.Second

// Store is the persistence layer for player profiles: per-job levels, combo
// loadouts (gear/skills/hotbar), and shared inventory.
type Store struct {
	mu       sync.RWMutex
	path     string
	profiles map[string]*Profile
	// byName maps strings.ToLower(hero name) to the canonical key in
	// profiles, making name lookups O(1) instead of an EqualFold scan.
	// Both the map key and Profile.Name are indexed (legacy files can
	// disagree). Maintained on load, create and delete.
	byName map[string]string
	// dirty marks gameplay changes flushed on the saveDebounce cadence;
	// dirtySoft marks position-only writes flushed on lazySaveInterval or
	// piggybacked onto the next urgent flush.
	dirty     bool
	dirtySoft bool

	// Background flusher (nil when path is empty — in-memory only).
	saveCh    chan struct{}
	lazyCh    chan struct{}
	done      chan struct{}
	flushed   chan struct{}
	closeOnce sync.Once
	writeMu   sync.Mutex // serializes Flush callers end-to-end
}

func Load(path string) *Store {
	s := &Store{path: path, profiles: map[string]*Profile{}, byName: map[string]string{}}
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
		// Legacy: the follow slot merged into the single active-pet slot.
		if p.FollowPetID != "" {
			if p.BattlePetID == "" {
				p.BattlePetID = p.FollowPetID
			}
			p.FollowPetID = ""
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
		for i := range p.HouseStorage {
			if p.HouseStorage[i].Kind == "" {
				p.HouseStorage[i].Kind = game.KindEquipment
			}
		}
		p.Inventory = game.CompactStacks(p.Inventory)
		p.VisitedSavePoints = addVisited(p.VisitedSavePoints, p.SavePointID)
		p.migrateClaraMundiIDs()
		p.migrateJobs()
		p.ensureUnlockedJobs()
	}
	for key, p := range s.profiles {
		s.indexProfileLocked(key, p)
	}
	if path != "" {
		s.saveCh = make(chan struct{}, 1)
		s.lazyCh = make(chan struct{}, 1)
		s.done = make(chan struct{})
		s.flushed = make(chan struct{})
		go s.flushLoop()
	}
	return s
}

// indexProfileLocked records a profile's lookup names in byName. Existing
// entries win: a case-variant duplicate (legacy GetOrCreate path) must not
// steal the canonical name. Callers hold s.mu.
func (s *Store) indexProfileLocked(key string, p *Profile) {
	if s.byName == nil {
		s.byName = map[string]string{}
	}
	if _, ok := s.byName[strings.ToLower(key)]; !ok {
		s.byName[strings.ToLower(key)] = key
	}
	if p != nil && p.Name != "" {
		if _, ok := s.byName[strings.ToLower(p.Name)]; !ok {
			s.byName[strings.ToLower(p.Name)] = key
		}
	}
}

// unindexProfileLocked drops every byName entry pointing at key. Callers
// hold s.mu.
func (s *Store) unindexProfileLocked(key string) {
	for k, v := range s.byName {
		if v == key {
			delete(s.byName, k)
		}
	}
}

// profileByNameLocked resolves a hero name to (*Profile, canonical key) in
// O(1) via the lowercase index. An EqualFold scan remains as a fallback for
// fold-exotic names ToLower cannot see (e.g. U+017F long s) and for
// case-variant duplicates the index does not claim. It never mutates state,
// so callers may hold either the read or the write lock.
func (s *Store) profileByNameLocked(name string) (*Profile, string) {
	if key, ok := s.byName[strings.ToLower(name)]; ok {
		if p := s.profiles[key]; p != nil {
			return p, key
		}
	}
	for key, p := range s.profiles {
		if strings.EqualFold(key, name) || strings.EqualFold(p.Name, name) {
			return p, key
		}
	}
	return nil, ""
}

// nameTakenLocked reports whether a hero name is in use (case-insensitive).
// Callers hold s.mu (read or write).
func (s *Store) nameTakenLocked(name string) bool {
	if _, ok := s.byName[strings.ToLower(name)]; ok {
		return true
	}
	for key := range s.profiles {
		if strings.EqualFold(key, name) {
			return true
		}
	}
	return false
}

// flushLoop debounces save notifications: a burst of mutations collapses into
// one write, so the hub goroutine never blocks on disk I/O. Low-urgency
// (position-only) notifications arm a fixed slow timer instead — it is not
// reset per move or a continuously moving player would starve it.
func (s *Store) flushLoop() {
	defer close(s.flushed)
	var lazy *time.Timer
	var lazyC <-chan time.Time
	noteLazy := func() {
		if lazy == nil {
			lazy = time.NewTimer(lazySaveInterval)
			lazyC = lazy.C
		}
	}
	stopLazy := func() {
		if lazy != nil {
			lazy.Stop()
			lazy = nil
			lazyC = nil
		}
	}
	for {
		select {
		case <-s.done:
			stopLazy()
			s.Flush()
			return
		case <-s.lazyCh:
			noteLazy()
			continue
		case <-lazyC:
			stopLazy()
			s.Flush()
			continue
		case <-s.saveCh:
		}
		t := time.NewTimer(saveDebounce)
		for {
			select {
			case <-s.done:
				t.Stop()
				stopLazy()
				s.Flush()
				return
			case <-s.saveCh:
				if !t.Stop() {
					select {
					case <-t.C:
					default:
					}
				}
				t.Reset(saveDebounce)
			case <-s.lazyCh:
				noteLazy()
			case <-lazyC:
				// Piggyback: this flush also clears dirtySoft.
				stopLazy()
				s.Flush()
			case <-t.C:
				s.Flush()
				goto waitForDirty
			}
		}
	waitForDirty:
	}
}

// Flush writes pending profile changes to disk. Safe to call any time; writes
// are serialized so a slower flush can never clobber a newer snapshot.
func (s *Store) Flush() {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()
	s.mu.Lock()
	if s.path == "" || (!s.dirty && !s.dirtySoft) {
		s.mu.Unlock()
		return
	}
	s.dirty = false
	s.dirtySoft = false
	data, err := json.MarshalIndent(s.profiles, "", "  ")
	s.mu.Unlock()
	if err != nil {
		log.Printf("store: marshal error: %v", err)
		return
	}
	writeFileAtomic(s.path, data)
}

// Close flushes pending writes and stops the background flusher.
func (s *Store) Close() {
	if s.done == nil {
		return
	}
	s.closeOnce.Do(func() {
		close(s.done)
		<-s.flushed
	})
}

// writeFileAtomic writes via a temp file + rename so a crash mid-write never
// leaves a torn JSON file.
func writeFileAtomic(path string, data []byte) {
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		log.Printf("store: mkdir error: %v", err)
		return
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o644); err != nil {
		log.Printf("store: write error: %v", err)
		return
	}
	if err := os.Rename(tmp, path); err != nil {
		// Windows may refuse renaming over an existing file.
		_ = os.Remove(path)
		if err := os.Rename(tmp, path); err != nil {
			log.Printf("store: rename error: %v", err)
		}
	}
}

// save marks the store dirty and notifies the background flusher; the caller's
// goroutine (often the hub loop) never touches the disk. Callers hold s.mu.
func (s *Store) save() {
	if s.saveCh == nil {
		return
	}
	s.dirty = true
	select {
	case s.saveCh <- struct{}{}:
	default:
	}
}

// saveLazy marks the store dirty at low urgency for position-only writes:
// the flusher writes on the lazySaveInterval cadence, and the dirt also
// piggybacks on the next urgent flush or Close. Callers hold s.mu.
func (s *Store) saveLazy() {
	if s.lazyCh == nil {
		return
	}
	s.dirtySoft = true
	select {
	case s.lazyCh <- struct{}{}:
	default:
	}
}
