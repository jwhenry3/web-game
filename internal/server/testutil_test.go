package server

import (
	"clara-mundi/internal/store"
)

func mustTestHub() *Hub {
	h, err := NewHub(store.Load(""), nil, nil)
	if err != nil {
		panic(err)
	}
	return h
}
