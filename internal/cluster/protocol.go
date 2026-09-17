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
