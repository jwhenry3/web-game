package store

import (
	"fmt"
	"time"

	"clara-mundi/internal/game"
)

// AddPet appends a captured pet to the profile collection.
func (s *Store) AddPet(name string, kind, petName string, level int) (Profile, game.PetRecord, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, game.PetRecord{}, "Character not found."
	}
	if len(p.Pets) >= game.MaxPets {
		return *p, game.PetRecord{}, fmt.Sprintf("Pet collection is full (%d).", game.MaxPets)
	}
	id := fmt.Sprintf("pet-%s-%d", kind, time.Now().UnixNano())
	rec := game.NewPetRecord(id, kind, petName, level)
	p.Pets = append(p.Pets, rec)
	s.save()
	return *p, rec, ""
}

// ReleasePet removes a pet and clears active/mount slots if they pointed at it.
func (s *Store) ReleasePet(name, petID string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	idx := -1
	for i, pet := range p.Pets {
		if pet.ID == petID {
			idx = i
			break
		}
	}
	if idx < 0 {
		return *p, "Pet not found."
	}
	p.Pets = append(p.Pets[:idx], p.Pets[idx+1:]...)
	if p.FollowPetID == petID {
		p.FollowPetID = ""
	}
	if p.BattlePetID == petID {
		p.BattlePetID = ""
	}
	if p.MountPetID == petID {
		p.MountPetID = ""
	}
	s.save()
	return *p, ""
}

// setPetSlot assigns petID to the given profile slot (empty clears).
func (s *Store) setPetSlot(name, petID string, slot func(p *Profile, id string)) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	if petID != "" && !p.hasPet(petID) {
		return *p, "Pet not found."
	}
	slot(p, petID)
	s.save()
	return *p, ""
}

// SetBattlePet sets the active pet that follows and joins fights (empty clears).
func (s *Store) SetBattlePet(name, petID string) (Profile, string) {
	return s.setPetSlot(name, petID, func(p *Profile, id string) { p.BattlePetID = id })
}

// SetMountPet sets the pet the mount keybind will ride (empty clears).
func (s *Store) SetMountPet(name, petID string) (Profile, string) {
	return s.setPetSlot(name, petID, func(p *Profile, id string) { p.MountPetID = id })
}

// UpdatePet replaces the stored PetRecord with the same ID (used for XP/level).
func (s *Store) UpdatePet(name string, pet game.PetRecord) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return
	}
	for i, existing := range p.Pets {
		if existing.ID == pet.ID {
			p.Pets[i] = pet
			s.save()
			return
		}
	}
}

func (p *Profile) hasPet(petID string) bool {
	for _, pet := range p.Pets {
		if pet.ID == petID {
			return true
		}
	}
	return false
}

// FindPet returns a copy of a pet by id.
func (p Profile) FindPet(petID string) (game.PetRecord, bool) {
	for _, pet := range p.Pets {
		if pet.ID == petID {
			return pet, true
		}
	}
	return game.PetRecord{}, false
}
