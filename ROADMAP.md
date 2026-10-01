# Roomboard Roadmap

Roomboard is being shaped as a focused launch approval product: one private room for the real material, reviewer calls, and a decision record, backed by credible Next.js App Router, Pixi.js canvas, Phoenix realtime, Supabase persistence, and Vercel delivery.

The current product promise is intentionally narrow:

> Add the real launch material, invite the reviewer who can decide, resolve every card, and close with a decision record.

This roadmap is the product and engineering control loop for the showcase. GitHub milestones and issues should mirror the sections below.

## Operating Model

- `ROADMAP.md` describes product direction, release criteria, and the next tranche of work.
- GitHub milestones define shippable slices.
- GitHub issues define implementation tasks with acceptance criteria.
- A task is done only when it is verified locally or against `https://www.roomboard.online`, and the verification is written in the issue or PR.
- Showcase work takes priority over broad SaaS work until the first milestone is complete.

## Engineering Health (2026-09 audit)

A full-stack review of the canvas, realtime layer, API surface, and infra. What holds up, what was fixed, and what remains.

### Done well

- **Realtime auth is symmetric and timing-safe.** Phoenix verifies HMAC-SHA256 room tokens with `Plug.Crypto.secure_compare`, room-id binding, version and expiry checks (`room_channel.ex`); the Next minter mirrors it with `timingSafeEqual` (`lib/roomboardRealtimeAccess.ts`). Tokens carry role + 10-min TTL; the secret is shared via `ROOMBOARD_REALTIME_SECRET` on both sides.
- **Server-side input hardening on the channel.** Room-id regex gate, event-type allowlist, 80KB JSON-size cap, string/number sanitizers on presence fields. Broadcasts stamp `roomId`/`senderId`/`sentAt` server-side.
- **True E2E smoke including failure injection.** `scripts/realtime-smoke.mjs` boots both services, drives two browsers, asserts presence counts and sync-contract chips, then kills Phoenix mid-session and verifies both pages degrade to fallback transport and edits still propagate.
- **Release gates are real.** `pnpm verify` (typecheck + tests + build), `readiness:local`/`readiness:prod`, `release:prod:check` with expected-git-SHA pinning, and a CI workflow running typecheck/test/build on every PR.
- **Honest degradation.** One-way fallback switch prevents flapping; SSE fallback keeps edits syncing when Phoenix dies.

### Fixed in this pass


- **Optimistic concurrency on room documents.** `mutateRoom` does read-modify-write guarded by a `version` token with conditional save (Supabase `document->>version` match, local store parity) and one retry; conflicts surface as `RoomConflictError` → HTTP 409 via `withRoomNotFoundAs404` instead of silently dropping a write.
- **Room version history.** Every committed mutation appends a capped (50-entry) `history` record — version, timestamp, item/connection/comment counts — exposed on the snapshot and shown as a `rev vN` chip on the canvas.
- **Phoenix channel hardening.** `room:event` enforces the signed role server-side (`viewer_read_only`), a 40-events/1s per-connection rate window, and presence updates are throttled to 40ms with a coalescing flush — closing the unbounded-fanout DoS hole.
- **Presence diff consumption + multiplayer selection.** The client consumes `presence_diff` (joins/leaves) instead of a manual broadcast, and each presence payload now carries `selection` — remote collaborators' selected cards get a ring in their cursor color.
- **Realtime token refresh on reconnect.** `createRoomboardRealtimeSession` accepts `getAccessToken`; channel `params` is a function and `rejoin` is wrapped so every rejoin mints a fresh 10-minute token via `refreshRoomSnapshot`.
- **Token storage consolidated.** `lib/roomTokens.ts` is the single owner of `roomboard-owner-tokens`/`roomboard-invite-tokens` localStorage maps; the triplicated logic in `CanvasRoom`, `RoomsDashboard`, and `LandingPage` is gone.
- **CanvasRoom decomposition.** `components/room/` now holds `RoomHeader.tsx` (header + main-menu dropdown), `RoomModals.tsx` (close/lock/profile modals), `RoomInspector.tsx`, `RoomToolbar.tsx`, `roomTypes.ts` (`CanvasPalette`, `RoomTheme`, `LocalUser`), `usePixiScene.ts` (boot/pan/zoom lifecycle), `drawItem.ts` (card render loop via `createDrawItem(ctx)`), and `connectionDrag.ts` (connection-drag handlers + pipe geometry via `createConnectionHandlers(ctx)`). `lib/pixiScene.ts` holds the scene type, zoom/text-resolution helpers, card geometry/text helpers, texture loading, texture-aware teardown. CanvasRoom: 6157 → 4171 lines.
- **Room actions hook extraction.** `components/room/useRoomActions.ts` now owns the transcript/agent/moderation/review-round action layer; `CanvasRoom` composes it alongside `useRoomMutations` and `usePresenceSync`, continuing the action-layer split named in the debt list.
- **Prettier applied repo-wide.** `pnpm format` run as a dedicated pass; `format:check` is clean and enforced in CI.
- **Presence map pruning.** `lib/presence.ts` drops a room's `snapshotsByRoom`/`clientsByRoom` entries once both are empty — the SSE fallback maps no longer grow one entry per room ever visited.
- **Dead `expiresAt` removed.** The Phoenix presence payload no longer computes an `expiresAt` nothing read; staleness is enforced client-side via `updatedAt` + `PRESENCE_TTL_MS`.
- **Dev PostHog throw removed.** `instrumentation-client.ts` warns instead of throwing when env is missing — hydration no longer dies in unconfigured dev environments.
- **GPU texture leak fixed.** `destroyItemContainer` destroys sprite textures on card removal/re-render; `removeChildren()` no longer detaches without destroying.
- **Zoom badge isolated.** `zoomPercent` moved out of React state to a DOM ref — wheel zoom no longer re-renders the whole room component per tick.
- **Distributed rate limiting.** `checkRateLimitDistributed` uses the `roomboard_rate_limit_hit` Postgres function (schema added) so limits hold across serverless instances; falls back to the in-memory bucket when Supabase is absent or the RPC fails.
- **Invite link expiration.** `inviteExpiresAt` on the room document; owner-only `PATCH action:"invite-expiry"`; expired invite tokens stop granting access (owner unaffected).
- **Richer recap export.** Markdown now includes a decision brief with next steps, a card-links section, and up to two comment excerpts per card.
- **Dead SSR removed.** `initialRooms` prop and the always-empty server-side `listRooms()` calls dropped from `app/page.tsx`, `app/rooms/page.tsx`, `app/for/[starter]/page.tsx`.
- **Signed URL TTL shortened.** Upload signed URLs re-minted per snapshot now live 1 hour instead of 7 days.
- **Lint tooling.** ESLint 9 flat config (`eslint-config-next`), Prettier config, `pnpm lint`/`format` scripts, and a Lint step in CI. Baseline: 0 errors, ~59 warnings (React-compiler-era rules kept as warnings).

### Remaining debt (priority order)

1. **CanvasRoom remains the largest file** (~3.2K lines after the `useRoomActions` extraction) but is now mostly orchestration: state, effects, and the JSX shell. The mutation/action layer now lives in `useRoomMutations` and `useRoomActions`; further extraction has diminishing returns.
2. **Render free-plan caveats.** Spin-down after 15min idle → >60s cold starts vs 45s join timeout; single-instance PubSub/Presence means scaling past 1 instance silently splits presence.
3. **Supabase rate-limit function deployed (resolved 2026-09-30).** Applied as tracked migration `20260930000000_distributed_rate_limit` through the Management API (`supabase db query --linked`, no DB password required) and recorded in `supabase_migrations.schema_migrations`. Verified live: production API calls accumulate buckets in `public.roomboard_rate_limits`, so `checkRateLimitDistributed` holds across serverless instances instead of failing open to in-memory.

## Milestone 1: Showcase v1 - reliable product preview

Goal: an employer, collaborator, or early user can open `https://www.roomboard.online`, understand the product in under a minute, create or join a private room, and see a believable realtime collaboration flow without hand-holding.

### Definition of Done

- The landing page communicates one clear category: launch approval rooms.
- Creating a private room, joining by editor/viewer invite, and reopening recent rooms works reliably.
- Notes, uploaded images, comments, connectors, card dragging, room lock, and room close all work in the hosted product preview.
- A two-browser or two-tab session shows live presence, cursor movement, and board updates with no confusing jumps or stale collaborator state.
- The room canvas feels production-grade: smooth drag, predictable zoom/pan, crisp cards, readable states, and polished empty/error states.
- The technical story is easy to explain: what Next.js owns, what Pixi.js owns, what Phoenix owns, how Supabase persists data, and how Vercel hosts the app.
- A production smoke checklist passes before sharing the project publicly.

### Workstreams

#### 1. Room Reliability

Make the happy path boringly dependable:

- Create a room from the landing page and dashboard.
- Open an existing room from recent rooms.
- Add note cards and image cards.
- Upload local images and preserve their aspect ratio.
- Drag cards without visual snap-back.
- Connect cards with readable, non-distracting lines.
- Lock and close rooms with clear user feedback.
- Verify the same flow on `www.roomboard.online`.

#### 2. Realtime Collaboration Feel

Make the room feel live without becoming noisy:

- Keep user cursors on a separate screen-space overlay so pan/zoom does not drag remote pointers incorrectly.
- Keep presence labels stable, readable, and cheap to render.
- Ensure board mutations are broadcast through Phoenix when available and degrade cleanly to the Next fallback.
- Remove stale collaborators quickly after tab close, refresh, or network loss.
- Keep a small sample state for the landing hero so the product feels active before the user opens a room.

#### 3. Room Lifecycle and Permissions

Make invite-first rooms feel intentional rather than unfinished:

- Remember the visitor's local display name and color.
- Explain invite access, locked rooms, closed rooms, and view-only states in the UI.
- Preserve creator-only controls through the local owner token.
- Make destructive actions reversible where possible, or clearly final where not.
- Add concise empty states for new rooms, closed rooms, and failed joins.

#### 4. Canvas and UX Polish

Keep the product visually credible:

- Preserve the design system from the current dark board direction.
- Support light mode only when the full room surface is styled, not partially inverted.
- Keep cards crisp at high zoom and avoid accidental raster scaling where vector/text rendering should remain sharp.
- Tune zoom limits so close inspection is possible without breaking interaction.
- Keep inspector panels, toolbar controls, and card states visually consistent.

#### 5. Employer-Facing Story

Make the project easy to evaluate:

- Add a short architecture section that explains Next.js, Pixi.js, Phoenix, Supabase, and Vercel responsibilities.
- Document what Pixi.js does in the room canvas.
- Keep screenshots and the portfolio case study aligned with the current production UI.
- Maintain a release checklist so future product pushes are not vibe-based.

## Milestone 2: SaaS-shaped MVP

This starts only after Showcase v1 is solid.

- Optional account system for personal room history.
- Organizations or small teams.
- Proxied private file delivery or shorter-lived signed asset rotation for stricter file controls.
- Room templates for review workflows.
- Better permissions: owner, editor, viewer.
- Exportable decision recap and shareable read-only snapshots.
- Account/workspace usage limits and automatic retention policies. Private-beta rooms already enforce document capacities, bounded JSON mutations, and owner-controlled permanent deletion of room data and hosted uploads.

## Milestone 3: Product Depth

Explore only if the project needs to grow beyond portfolio and first-user value:

- Multiplayer selection and card editing conflicts.
- Version history and room activity search.
- Better asset management for moodboards and design references.
- Comment resolution states.
- Invite links with expiration.
- More expressive canvas tools without becoming a general whiteboard clone.

## Milestone 4: Agent Rooms — decision rooms with BYO agents

Decision (2026-09): Roomboard evolves from human-only launch approval rooms into decision rooms where humans and their own AI agents work together. This direction supersedes Milestones 2–3 as the product path; Milestone 1 remains the reliability base. Positioning: "launch approval rooms where you and your agents make the call."

### Product shape

- Rooms stay private, invite-based, decision-first. The decision record remains the artifact humans sign.
- Every participant can connect their own agents (Claude Code, Codex, Hermes, any MCP client). Agents join as first-class room participants with bot identity; model keys, tools, and private memory stay on the user's machine. Roomboard stores no provider keys.
- The card is the unit of agent work: assignment, status transitions, and findings-as-comments. The transcript is coordination; results land on cards so recap and decision record assemble automatically. This is the differentiator vs flat agent chatrooms (agent-room.com, Free4Chat, Human-Agent Chatroom MCP), which have transcripts and task boards but no decision model.

### Locked decisions

- **Connectivity: BYO over MCP.** Stateless Streamable HTTP MCP server at `/api/mcp` (short JSON-RPC POSTs, cursor-based `room_read` polling; no SSE held open on Vercel Functions, per the existing production realtime rule).
- **Live fanout stays on Phoenix.** Next posts server-originated events to a sidecar internal endpoint (`POST /internal/room-event`, signed with `ROOMBOARD_REALTIME_SECRET`), which broadcasts them into `room:<id>`. The transcript event is `room:message`, shared by human and agent messages and allowlisted in both the channel and the sidecar internal endpoint. Local dev without Phoenix degrades through the existing SSE fallback.
- **Identity: per-agent tokens** minted by the room owner (`agent:create` / `agent:revoke` room actions, hash stored in the document, token shown once with a ready-to-paste `claude mcp add` snippet). Sender identity is stamped server-side from the token, never from payload — same contract as the channel's `senderId`.
- **Turn model: hybrid.** MVP is mention-driven with a room-level turn budget (N consecutive agent messages → agents muted until a human speaks). Layer 2 adds per-card review rounds (critique phase → decision-signal phase → checkpoint recompute) orchestrated server-side over the same event contract.
- **Guardrails:** per-agent distributed rate limits (reuse `roomboard_rate_limit_hit`), message size caps, bounded transcript in the room document (`assertRoomCapacity`, ~240 entries), 64KB mutation limit unchanged.
- **Arbiter (Slice 3, schema reserved from Slice 1):** three-layer injection defense — (1) deterministic server-side filter before persist (size caps, type allowlist, fake role-marker stripping; impersonation impossible by design); (2) arbiter = BYO observer agent with read-all + `room_flag` tools only, scanning async in throttled batches; flags persist in a `flags` collection and surface in the UI; (3) enforcement (mute/quarantine) is an owner action or an explicit owner-set policy, never arbiter discretion. Trust hierarchy: server checks > human owner > arbiter advice > agent messages. Goal is containment, not cure: humans sign decisions.

### Slices

1. **Slice 1 — tracer bullet (shipped 2026-09-26).** Room document fields (`agents`, `messages`, reserved `flags`); owner agent-token create/revoke; MCP server with `room_read`, `room_send`, `room_comment_item`, `room_decision_signal`, `room_status`; sidecar internal broadcast + `room:message` allowlist; transcript panel with bot badges and soft agent presence (`lastSeenAt`); turn budget and per-agent rate limits; tests (`tests/roomAgent*.test.ts` plus sidecar controller/channel tests); `pnpm verify` green.
   Acceptance met: a real MCP client flow (JSON-RPC `initialize`/`tools/list`/`tools/call`) joined a local room, read structured state, posted messages that appeared live in an open browser over both the SSE fallback and the Next+Phoenix internal broadcast path, commented a card, backed it with a decision signal, was muted by the turn budget until a human spoke, and was instantly silenced (HTTP 401) by owner revoke.
2. **Slice 2 — decision integration (shipped 2026-09-26).** Card `assignee` (`agent:<agentId>` or a human user id; inspector picker, PATCH passthrough, `assignee` in `room_read` items, `yourCards` in `room_status`); mention wake semantics (`@name` tokens resolved server-side in `addRoomMessage` when the sender declares none, `wake` list in `room_read`); agent decision signals counted in checkpoints (`agentBackedCount` on the room summary, "· N backed by agents" suffix on checkpoint detail — tone still follows card statuses only); agent-review section in the recap export (`agentReview` on the recap plus a `## Agent review` markdown section with per-agent messages, comments, and backed cards). Verified end-to-end: assignment through UI picker and API, wake round-trip human→agent, checkpoint suffix, recap markdown.
3. **Slice 3 — arbiter + rounds (shipped 2026-09-26).** Three-layer injection defense: (1) deterministic server-side sanitizer strips control characters and neuters line-leading role markers (`system:`, `assistant:`) before persist; (2) arbiter agents (roster role `isArbiter`) get a read-only MCP toolset plus `room_flag`, flags persist in the reserved `flags` collection and surface as badges in the transcript; (3) enforcement stays with the owner — manual mute/unmute plus an owner-set auto-mute policy (N externally-flagged messages → muted until released). Per-card review rounds: server-orchestrated critique→vote ritual with pure progression logic (`lib/roomRounds.ts`), inspector phase chips + waiting list, MCP `openRounds` with `pendingYou`. Verified end-to-end: arbiter toolset split, flag→auto-mute→unmute cycle, sanitized injection text, round lifecycle critique→vote→closed through both API and inspector UI. Platform-hosted arbiter remains an optional future addition (BYO arbiters cover the flow without storing provider keys).

### Risks

- Cross-agent prompt injection is irreducible in BYO rooms (user A's content is user B's agent input): mitigated by server-stamped attribution, deterministic filtering, arbiter flags, and human-signed decisions — never by trusting agent output.
- Vercel function limits vs agent polling frequency: keep `room_read` cursor-based and cheap; push delivery to long-lived agents over the sidecar socket is a later optimization.
- The agent-room landscape is active and partly free/MIT; the moat is the decision product (checkpoints, decision record, recap), not the chat.

## Release Checklist

Before calling a Roomboard build showcase-ready:

Use `LAUNCH.md` for campaign positioning, first-user entry URLs, and the do-not-launch checks.

### Automated checks

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- `pnpm verify` as the standard local pre-release bundle.
- `pnpm readiness:local` after starting `pnpm dev` or `pnpm start -p 3050`; this checks the public launch surface, sample room, privacy/billing indexing, private room defaults, invite access, owner controls, upload gating, and legacy API shutdown.
- `pnpm release:local` after starting `pnpm dev` or `pnpm start -p 3050`; this runs `pnpm verify`, `pnpm readiness:local`, and `git diff --check`.
- `pnpm readiness:prod` after deployment and before inviting first users or sending paid traffic.
- `pnpm realtime:prod` to verify the live Next `/api/health` realtime checks and the configured Phoenix sidecar `/health` endpoint agree before traffic.
- `pnpm smoke` for the local app path after starting `pnpm dev` or `pnpm start -p 3050`.
- `pnpm smoke:agents` exercises the agent MCP surface without a browser: token mint, JSON-RPC initialize/tools/call round-trip, transcript persistence in the snapshot, hash-free roster projection, and 401 for the token after revoke. `pnpm readiness:local` / `readiness:prod` probe `/api/mcp` (401 unauthenticated, 405 on GET) as part of the launch contract. Note: `pnpm smoke`'s browser flow additionally needs a GPU-capable headless Chromium; on software-GL machines it hits a pre-existing pixi PageError (`reading 'next'`, reproducible on clean origin/main) unrelated to agent rooms.
- `pnpm smoke:realtime` to launch Next + Phoenix, verify realtime fanout, then verify fallback after Phoenix stops. Requires the Elixir toolchain and `mix setup` in `realtime/roomboard_realtime/` first.
- `SMOKE_BASE_URL=https://www.roomboard.online pnpm smoke` against the production showcase. This creates, mutates, and uploads assets for a real smoke-test room, then permanently deletes its room document and hosted uploads.
- `curl -fsS https://<phoenix-host>/health` returns healthy for the deployed sidecar.
- `curl -fsS https://www.roomboard.online/api/health` returns `launchReady: true` before inviting real users; failed `launch.checks` include the concrete remediation.
- Vercel and Phoenix/Render share the same `ROOMBOARD_REALTIME_SECRET`; production Phoenix joins without a signed room token are rejected.
- `/api/rooms` returns only rooms owned by the current browser's owner tokens or remembered invite tokens; newly created rooms are not globally discoverable. The sample room is available only through its explicit room URL.
- Upload privacy is stated accurately: hosted uploads are editor-gated before creation, stored in a private bucket, and exposed through signed asset URLs for authorized room snapshots.

### Manual production checks

- `https://www.roomboard.online` loads with the expected favicon and current landing UI.
- Create a room from the landing page or dashboard.
- Open the room URL in a second tab or browser and verify a bare link is blocked until an editor or viewer invite is used.
- Add a note card and an image card; verify both appear in the second session.
- Drag cards, connect two cards, edit a note, and add a comment.
- Verify the viewer invite can read but cannot mutate the board.
- Unlock only when deliberately testing link-access mode, make another board change, then close the room and verify both sessions show the closed state.
- Two-tab realtime presence, cursor movement, and board mutation flow are manually verified through Phoenix; if Phoenix is unavailable, the UI clearly indicates local fallback and board edits still sync.
- Any known launch caveats are documented in the active GitHub milestone.
