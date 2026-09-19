package game

import "testing"

// MundiTerrain GIDs must resolve through CharFromPipoyaGroundGID (the shared
// ground-GID funnel) so the loader, ASCII dump, and PNG bake all agree on
// what each custom tile means.
func TestMundiGroundGIDChars(t *testing.T) {
	cases := []struct {
		local int
		want  byte
	}{
		{MundiLocalSnowFill, TileSnow},
		{MundiLocalPackedSnow, TileSnow},
		{MundiLocalIce, TileIce},
		{MundiLocalDuneSand, TileSand},
		{MundiLocalBeachSand, TileSand},
		{MundiLocalScree, TileGrass},
		{MundiLocalAsh, TileGrass},
		{MundiLocalPeat, TileGrass},
		{MundiLocalPineTL, TileTree},
		{MundiLocalPalmTL, TileTree},
		{MundiLocalDeadGreyTL, TileTree},
		{MundiLocalPineTL + 8, TileTree},   // canopy bottom row
		{MundiLocalBoulder, TileGrass},     // blocking props resolve to grass;
		{MundiLocalRockSpire, TileGrass},   // the collision flag turns them '#'
		{MundiLocalGiantMushroom, TileGrass},
	}
	for _, tc := range cases {
		got, ok := CharFromPipoyaGroundGID(MundiGID(tc.local))
		if !ok || got != tc.want {
			t.Errorf("local %d: got %q ok=%v, want %q", tc.local, got, ok, tc.want)
		}
	}
}

func TestMundiGroundGIDOutOfRange(t *testing.T) {
	for _, gid := range []int{MundiFirstTerrain - 1, MundiFirstTerrain + MundiTerrainTiles, MundiFirstTerrain + 200} {
		if ch, ok := CharFromPipoyaGroundGID(gid); ok {
			t.Errorf("gid %d: expected miss, got %q", gid, ch)
		}
	}
}

// Tree canopy vs trunk classification must match the stamp layout — tops are
// walk-under overhead art, bottoms collide.
func TestMundiTreeLocalRanges(t *testing.T) {
	for _, stamp := range MundiTreeStamps {
		if !IsMundiTreeTopLocal(stamp[0]) || !IsMundiTreeTopLocal(stamp[1]) {
			t.Errorf("stamp %+v: tops not classified as canopy", stamp)
		}
		if IsMundiTreeTopLocal(stamp[2]) || IsMundiTreeTopLocal(stamp[3]) {
			t.Errorf("stamp %+v: trunks misclassified as canopy", stamp)
		}
		for _, l := range stamp {
			if !IsMundiTreeLocal(l) {
				t.Errorf("stamp %+v: local %d not a tree tile", stamp, l)
			}
		}
	}
}

// Blocking locals drive collision stamping in gencontinent — rocks, spires,
// and trunks must block while soft cover (ferns, shrubs, drifts) must not.
func TestMundiBlockingLocals(t *testing.T) {
	for _, l := range []int{
		MundiLocalBoulder, MundiLocalRockSpire, MundiLocalCharredStump,
		MundiLocalObsidian, MundiLocalCactusTall, MundiLocalStoneMarker,
	} {
		if !MundiBlockingLocals[l] {
			t.Errorf("local %d should block", l)
		}
	}
	for _, l := range []int{
		MundiLocalFern, MundiLocalSage, MundiLocalSnowShrub, MundiLocalSnowDrift,
		MundiLocalReedsTall, MundiLocalShells, MundiLocalDriftwood, MundiLocalSkull,
	} {
		if MundiBlockingLocals[l] {
			t.Errorf("local %d should not block", l)
		}
	}
}
