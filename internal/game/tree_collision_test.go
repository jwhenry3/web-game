package game

import "testing"

// 2×2 tree stamps must leave exactly one blocked cell — the bottom-left
// trunk, whose iso diamond's bottom vertex anchors the billboard. The
// bottom-right mate stays walkable under the isometric projection.
func TestNormalizeTreeCollision(t *testing.T) {
	cols, rows := 6, 4
	ground := make([]int, cols*rows)
	collision := make([]int, cols*rows)

	stamp := func(c, r, firstGID int, s PipoyaTreeStamp) {
		ground[r*cols+c] = firstGID + s[0]
		ground[r*cols+c+1] = firstGID + s[1]
		ground[(r+1)*cols+c] = firstGID + s[2]
		ground[(r+1)*cols+c+1] = firstGID + s[3]
		collision[(r+1)*cols+c] = 1
		collision[(r+1)*cols+c+1] = 1
	}
	stamp(1, 0, PipoyaFirstBaseChip, PipoyaTreeStamps[0])    // small tree
	stamp(4, 0, PipoyaFirstBaseChip, PipoyaBigTreeStamps[0]) // big tree
	stamp(0, 2, MundiFirstTerrain, MundiTreeStamps[0])       // pine

	rock := 3*cols + 3
	collision[rock] = 1 // unrelated blocked cell must survive

	normalizeTreeCollision(collision, ground, cols, rows)

	blocked := []int{1*cols + 1, 1*cols + 4, 3*cols + 0} // BL cells
	for _, i := range blocked {
		if collision[i] == 0 {
			t.Fatalf("trunk cell %d should stay blocked", i)
		}
	}
	cleared := []int{1*cols + 2, 1*cols + 5, 3*cols + 1} // BR cells
	for _, i := range cleared {
		if collision[i] != 0 {
			t.Fatalf("bottom-right mate cell %d should be walkable", i)
		}
	}
	if collision[rock] == 0 {
		t.Fatal("unrelated blocked cell was cleared")
	}
}

// Partial stamps (mates missing or overwritten) are not touched.
func TestNormalizeTreeCollisionPartialStamp(t *testing.T) {
	cols, rows := 3, 3
	ground := make([]int, cols*rows)
	collision := make([]int, cols*rows)

	s := PipoyaTreeStamps[0]
	ground[0] = PipoyaFirstBaseChip + s[0]
	ground[1] = PipoyaFirstBaseChip + s[1]
	ground[cols] = PipoyaFirstBaseChip + s[2]
	// BR mate is plain grass — not a complete stamp.
	collision[cols+1] = 1

	normalizeTreeCollision(collision, ground, cols, rows)

	if collision[cols+1] == 0 {
		t.Fatal("partial stamp collision should be untouched")
	}
}
