package store

import (
	"fmt"

	"clara-mundi/internal/game"
)

func houseStorageCap() int {
	if game.DefaultHouseStorageCapacity < 1 {
		return 40
	}
	return game.DefaultHouseStorageCapacity
}

// SetCampSkin persists the player's chosen overworld tent graphic.
func (s *Store) SetCampSkin(name, skin string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	p.CampSkin = game.NormalizeCampSkin(skin)
	s.save()
	return *p, ""
}

// CampSkinFor returns the normalized tent skin for a profile.
func (s *Store) CampSkinFor(name string) string {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return game.DefaultCampSkin
	}
	return game.NormalizeCampSkin(p.CampSkin)
}

// HouseStorageSlots counts occupied storage slots (one pile / unique item each).
func (p *Profile) HouseStorageSlots() int {
	return len(p.HouseStorage)
}

func (p *Profile) itemEquipped(itemID string) bool {
	if itemID == "" {
		return false
	}
	l := p.ActiveLoadout()
	for _, id := range l.Equipped {
		if id == itemID {
			return true
		}
	}
	return false
}

// DepositHouseStorage moves qty of an inventory item into house storage.
func (s *Store) DepositHouseStorage(name, itemID string, qty int) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	if qty < 1 {
		qty = 1
	}
	idx := -1
	var item game.Item
	for i, it := range p.Inventory {
		if it.ID == itemID {
			idx = i
			item = it
			break
		}
	}
	if idx < 0 {
		return *p, "Item not in inventory."
	}
	if p.itemEquipped(itemID) {
		return *p, "Unequip that item before depositing it."
	}
	have := game.ItemQty(item)
	if qty > have {
		qty = have
	}
	moving := item
	moving.Qty = qty

	// Equipment / unique piles need a free slot; stackables may merge.
	needsSlot := true
	if game.CanStack(moving) {
		for _, st := range p.HouseStorage {
			if sameStackStore(st, moving) {
				needsSlot = false
				break
			}
		}
	}
	if needsSlot && len(p.HouseStorage) >= houseStorageCap() {
		return *p, fmt.Sprintf("House storage is full (%d slots).", houseStorageCap())
	}

	if have == qty {
		p.Inventory = append(p.Inventory[:idx], p.Inventory[idx+1:]...)
	} else {
		p.Inventory[idx].Qty = have - qty
	}
	p.HouseStorage = game.AddItems(p.HouseStorage, []game.Item{moving})
	p.HouseStorage = game.CompactStacks(p.HouseStorage)
	s.save()
	return *p, ""
}

// WithdrawHouseStorage moves qty from house storage into inventory.
func (s *Store) WithdrawHouseStorage(name, itemID string, qty int) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	if qty < 1 {
		qty = 1
	}
	idx := -1
	var item game.Item
	for i, it := range p.HouseStorage {
		if it.ID == itemID {
			idx = i
			item = it
			break
		}
	}
	if idx < 0 {
		return *p, "Item not in house storage."
	}
	have := game.ItemQty(item)
	if qty > have {
		qty = have
	}
	moving := item
	moving.Qty = qty
	if have == qty {
		p.HouseStorage = append(p.HouseStorage[:idx], p.HouseStorage[idx+1:]...)
	} else {
		p.HouseStorage[idx].Qty = have - qty
	}
	p.Inventory = game.AddItems(p.Inventory, []game.Item{moving})
	p.Inventory = game.CompactStacks(p.Inventory)
	s.save()
	return *p, ""
}

func sameStackStore(a, b game.Item) bool {
	if !game.CanStack(a) || !game.CanStack(b) {
		return false
	}
	if a.Kind != b.Kind || a.Level != b.Level {
		return false
	}
	switch a.Kind {
	case game.KindConsumable:
		return a.Consumable == b.Consumable
	case game.KindDecoration, game.KindCrafting:
		if a.Type != "" || b.Type != "" {
			return a.Type == b.Type
		}
		return a.Name == b.Name
	default:
		return a.Consumable == b.Consumable && a.Name == b.Name
	}
}

// PlaceHouseFurniture removes an inventory item and places it as a decoration.
func (s *Store) PlaceHouseFurniture(name, itemID string, col, row int) (Profile, game.HouseFurniture, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, game.HouseFurniture{}, "Character not found."
	}
	if !game.HouseWalkable(col, row) {
		return *p, game.HouseFurniture{}, "Cannot place furniture outside the walkable area."
	}
	for _, f := range p.HouseFurniture {
		if f.Col == col && f.Row == row {
			return *p, game.HouseFurniture{}, "That tile already has furniture."
		}
	}
	idx := -1
	var item game.Item
	for i, it := range p.Inventory {
		if it.ID == itemID {
			idx = i
			item = it
			break
		}
	}
	if idx < 0 {
		return *p, game.HouseFurniture{}, "Item not in inventory."
	}
	if p.itemEquipped(itemID) {
		return *p, game.HouseFurniture{}, "Unequip that item before placing it."
	}
	// Place one unit of the pile.
	have := game.ItemQty(item)
	placed := item
	placed.Qty = 1
	if have <= 1 {
		p.Inventory = append(p.Inventory[:idx], p.Inventory[idx+1:]...)
	} else {
		p.Inventory[idx].Qty = have - 1
	}
	furn := game.HouseFurniture{
		ID:    fmt.Sprintf("furn-%08x", hashNameTile(name, col, row, len(p.HouseFurniture))),
		Col:   col,
		Row:   row,
		Owner: name,
		Item:  placed,
	}
	p.HouseFurniture = append(p.HouseFurniture, furn)
	s.save()
	return *p, furn, ""
}

func hashNameTile(name string, col, row, n int) uint32 {
	h := uint32(2166136261)
	for _, c := range name {
		h ^= uint32(c)
		h *= 16777619
	}
	h ^= uint32(col*73856093 ^ row*19349663 ^ n*83492791)
	return h
}

// PickHouseFurniture returns a furniture piece to inventory.
func (s *Store) PickHouseFurniture(name, furnitureID string) (Profile, string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return Profile{}, "Character not found."
	}
	idx := -1
	var furn game.HouseFurniture
	for i, f := range p.HouseFurniture {
		if f.ID == furnitureID {
			idx = i
			furn = f
			break
		}
	}
	if idx < 0 {
		return *p, "Furniture not found."
	}
	p.HouseFurniture = append(p.HouseFurniture[:idx], p.HouseFurniture[idx+1:]...)
	restored := furn.Item
	restored.Qty = 1
	if restored.ID == "" {
		restored.ID = furn.ID
	}
	p.Inventory = game.AddItems(p.Inventory, []game.Item{restored})
	p.Inventory = game.CompactStacks(p.Inventory)
	s.save()
	return *p, ""
}

// HouseFurnitureSnapshot returns a copy of placed decorations.
func (s *Store) HouseFurnitureSnapshot(name string) []game.HouseFurniture {
	s.mu.Lock()
	defer s.mu.Unlock()
	p, ok := s.profiles[name]
	if !ok {
		return nil
	}
	out := make([]game.HouseFurniture, len(p.HouseFurniture))
	copy(out, p.HouseFurniture)
	return out
}
