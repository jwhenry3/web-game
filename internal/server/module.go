package server

import (
	"encoding/json"
	"fmt"

	"clara-mundi/internal/protocol"
)

type clientRoute func(*Client, json.RawMessage)
type disconnectHook func(*Client)

// routeRegistry is the feature-module seam for messages handled by the Hub's
// single Run goroutine. Modules register routes and lifecycle hooks during Hub
// construction; dispatch never starts another goroutine.
type routeRegistry struct {
	routes          map[protocol.MessageType]clientRoute
	disconnectHooks []disconnectHook
}

func newRouteRegistry() *routeRegistry {
	return &routeRegistry{routes: make(map[protocol.MessageType]clientRoute)}
}

func (r *routeRegistry) register(messageType protocol.MessageType, handler clientRoute) error {
	if handler == nil {
		return fmt.Errorf("register route %q: nil handler", messageType)
	}
	if _, exists := r.routes[messageType]; exists {
		return fmt.Errorf("register route %q: duplicate route", messageType)
	}
	r.routes[messageType] = handler
	return nil
}

func (r *routeRegistry) handle(c *Client, messageType protocol.MessageType, payload json.RawMessage) bool {
	handler, ok := r.routes[messageType]
	if !ok {
		return false
	}
	handler(c, payload)
	return true
}

func (r *routeRegistry) onDisconnect(hook disconnectHook) {
	r.disconnectHooks = append(r.disconnectHooks, hook)
}

func (r *routeRegistry) disconnect(c *Client) {
	for _, hook := range r.disconnectHooks {
		hook(c)
	}
}
