# Wire protocol (JSON + Protobuf)

## Source of truth

Protobuf schemas live in [`proto/fantasy/v1/`](../proto/fantasy/v1/):

| File | Contents |
|------|----------|
| `common.proto` | Shared types (profile, map, entities, items, …) |
| `messages.proto` | `WireEnvelope` + per-message payloads |

Generate Go code:

```bash
npm run proto:gen
# → internal/protocol/pb/*.pb.go
```

Requires `protoc` and `protoc-gen-go` on `PATH`.

## Negotiation

| Client | Codec | How |
|--------|-------|-----|
| Wails / `clientnet` | Protobuf binary frames | `?codec=protobuf` and/or `Sec-WebSocket-Protocol: fantasy.protobuf` |
| Other / tools | JSON text frames | default (no codec query) |

The hub still works in **JSON envelopes** (`protocol.Encode`). The proxy converts at the edge for protobuf sessions (`protocol.EncodeFrame` / `DecodeFrame`).

## Wire envelope (protobuf)

```protobuf
message WireEnvelope {
  string type = 1;
  bytes payload = 2; // protobuf-encoded typed message
}
```

`type` values match existing string message types (`move`, `welcome`, …).
