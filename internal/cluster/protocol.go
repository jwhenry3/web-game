package cluster

// TransferRequest is a map→proxy request to move a session to another map.
// Clients never see this type.
type TransferRequest struct {
	ClientID string
	DestMap  string
	DestX    float64
	DestY    float64
	Facing   string
}

// AttachRequest binds a proxy WebSocket session to a map hub.
type AttachRequest struct {
	ClientID  string
	AccountID string
	Username  string
	SpawnX    float64
	SpawnY    float64
	UseSpawn  bool
	Facing    string
}
