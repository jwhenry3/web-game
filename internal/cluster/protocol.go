package cluster

// TransferRequest is a map→proxy request to move a session to another map.
// Clients never see this type. A request is either absolute (DestX/DestY)
// or edge-derived (Edge is the entry edge on the destination map, EdgeT the
// 0..1 fraction along it) — the destination node computes its own landing.
type TransferRequest struct {
	ClientID string
	DestMap  string
	DestX    float64
	DestY    float64
	Facing   float64
	Edge     string
	EdgeT    float64
	// House carries instance context when DestMap is a dynamic house id
	// (house:<owner>). The proxy lazily creates the instance node from it.
	House *HouseSpec
}

// HouseSpec describes a dynamic house instance: which camp owns it and where
// occupants return when they leave or are evicted.
type HouseSpec struct {
	Owner     string
	Skin      string
	ReturnMap string
	ReturnX   float64
	ReturnY   float64
}

// HouseMapID returns the dynamic map id for a player's house instance.
func HouseMapID(owner string) string { return "house:" + owner }

// ParseHouseMapID extracts the owner name from a dynamic house map id.
func ParseHouseMapID(id string) (owner string, ok bool) {
	const prefix = "house:"
	if len(id) > len(prefix) && id[:len(prefix)] == prefix {
		return id[len(prefix):], true
	}
	return "", false
}

// AttachRequest binds a proxy WebSocket session to a map hub.
type AttachRequest struct {
	ClientID  string
	AccountID string
	Username  string
	SpawnX    float64
	SpawnY    float64
	UseSpawn  bool
	Facing    float64
	// Edge/EdgeT: when UseSpawn and Edge != "", the hub resolves the
	// mirrored entry point on this edge instead of using SpawnX/Y.
	Edge  string
	EdgeT float64
}
