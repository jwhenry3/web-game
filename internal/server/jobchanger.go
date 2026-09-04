package server

import (
	"clara-mundi/internal/game"
	"clara-mundi/internal/protocol"
)

const jobChangerInteractRange = 80.0

func (h *Hub) worldJobChangers() []protocol.JobChanger {
	points := game.JobChangers
	if h.overworld != nil {
		points = h.overworld.JobChangers
	}
	out := make([]protocol.JobChanger, 0, len(points))
	for _, jc := range points {
		c := game.TileCenter(jc.Tile)
		out = append(out, protocol.JobChanger{ID: jc.ID, Name: jc.Name, X: c.X, Y: c.Y})
	}
	return out
}

func (h *Hub) jobChangerByID(id string) (game.JobChanger, bool) {
	if h.overworld != nil {
		return h.overworld.JobChangerByID(id)
	}
	return game.JobChangerByID(id)
}

func (h *Hub) nearJobChanger(x, y float64, id string) bool {
	jc, ok := h.jobChangerByID(id)
	if !ok {
		return false
	}
	center := game.TileCenter(jc.Tile)
	return dist(x, y, center.X, center.Y) <= jobChangerInteractRange
}
