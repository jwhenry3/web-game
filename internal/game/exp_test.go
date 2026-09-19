package game

import "testing"

func TestXPTableCoversLevelCap(t *testing.T) {
	// Levels 1→2 through (LevelCap-1)→LevelCap each need an explicit entry.
	if len(XPTable) < LevelCap-1 {
		t.Fatalf("XPTable has %d entries, needs at least %d", len(XPTable), LevelCap-1)
	}
}

func TestXPTableExponentialClimb(t *testing.T) {
	prev := 0
	for i, xp := range XPTable {
		if xp <= 0 {
			t.Fatalf("XPTable[%d] (level %d→%d) must be positive, got %d", i, i+1, i+2, xp)
		}
		if xp <= prev {
			t.Fatalf("XPTable must strictly increase: level %d→%d (%d) not above previous (%d)", i+1, i+2, xp, prev)
		}
		prev = xp
	}
}

func TestXPToNextClamps(t *testing.T) {
	if got := XPToNext(0); got != XPTable[0] {
		t.Fatalf("level 0 should clamp to first entry, got %d", got)
	}
	if got := XPToNext(len(XPTable) + 5); got != XPTable[len(XPTable)-1] {
		t.Fatalf("beyond-cap levels should clamp to last entry, got %d", got)
	}
	if got := XPToNext(2); got != XPTable[1] {
		t.Fatalf("level 2 should use XPTable[1], got %d", got)
	}
}
