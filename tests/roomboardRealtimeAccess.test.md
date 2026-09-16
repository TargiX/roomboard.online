# Roomboard realtime access token contracts

Covers the HMAC-SHA256 signed short-lived room token in `lib/roomboardRealtimeAccess.ts`
(`rb1` payload schema) against the wire contract consumed by the Phoenix sidecar
(`realtime/roomboard_realtime/.../room_channel.ex`).

## What is locked

- Create: runtime shape (`payload.signature`, base64url, dot separator), TTL ≈ 10 min, `roomId` + `role` echo, `v = "rb1"`.
- Schema parity with the Elixir verifier: exactly `exp` / `role` / `roomId` / `v` keys; `exp` is a number (float accepted, sidecar `is_number` parity).
- HMAC-SHA256 over the base64url payload bytes (not the decoded JSON), base64url unpadded signature — the exact bytes the sidecar's `secure_signature?` compares.
- Verify: valid round-trip; cross-room bind rejected; expired rejected; secret mismatch rejected; malformed shapes rejected without throwing;
  signature comparison is length-safe (timing-safe path does not crash on short signatures).
- Secret handling: no secret → `create` returns `null`, `verify` returns `false`, `hasRoomboard…` is `false`; secret required for a token to exist at all.
- Serialization format contract: plaintext JSON payload, no header segment (documented divergence from JWT — private wire format).
- `exp` number comparison semantics (e.g. `exp = 0`, float `exp`).
