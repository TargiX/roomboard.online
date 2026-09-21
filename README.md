# Roomboard

**Live app:** [www.roomboard.online](https://www.roomboard.online)

**Product entry points:** [landing review](https://www.roomboard.online/for/landing-review) · [moodboard](https://www.roomboard.online/for/moodboard) · [blank room](https://www.roomboard.online/for/blank-room)

**Source:** [github.com/TargiX/flux-graph-pixi](https://github.com/TargiX/flux-graph-pixi)

Roomboard is a launch approval room for real pages and campaigns, reviewer calls, and a clear decision record.

Open a room, start from a seeded board when useful, invite editors or viewers, keep feedback attached to the visual work, and close the room when the decision is made. Rooms are private and locked by default. The creator keeps owner access in their browser, while collaborators join through role-specific invite links.

## Product surface

- Scenario-specific entry pages for first users:
  - `/for/landing-review` for approving the page or campaign that is about to launch.
  - `/for/moodboard` for choosing a visual direction with references and criteria.
  - `/for/blank-room` for prepared screenshots, product states, or creative material.
- The general `Start launch approval` CTA opens a clean workflow with a decision question, visual material prompt, approval criteria, and final decision record, then asks the owner to add real material before inviting someone.
- Private, locked room creation by default.
- Creator owner token, editor invites, viewer invites, owner backup link, and close-room flow.
- Owner-controlled permanent deletion removes the room document and hosted uploads after an explicit confirmation.
- A clean launch-approval starter plus secondary moodboard and blank-room workflows.
- Active rooms dashboard that only shows rooms created in this browser or opened from invite links.
- First-room launch guide that points users to the first real visual material, a ready-to-send invite message, and the owner backup link.
- Visual board with draggable notes and image cards, comments, statuses, connectors, upload support, live cursors, and recap export.
- Bounded room documents (80 cards, 240 comments, 160 connectors, and 50 decision signals per card) plus a 64KB JSON mutation limit.
- Privacy notes that explain token-based access, uploads, presence, and analytics without requiring accounts.
- A public support contact, configurable with `NEXT_PUBLIC_ROOMBOARD_SUPPORT_EMAIL` and defaulting to `support@roomboard.online`.

## Run

```bash
pnpm install
pnpm dev
```

Then open `http://localhost:3050`.

Open one of the scenario routes, create a room, then copy the invite message from the launch guide. To test collaboration locally, open the editor invite in another browser profile or private window.

## Useful commands

```bash
pnpm typecheck
pnpm test
pnpm build
pnpm verify
pnpm readiness:local
pnpm release:local
pnpm readiness:prod
pnpm realtime:prod
pnpm realtime:prod:session
pnpm release:prod:check
pnpm smoke
pnpm smoke:realtime
```

### Smoke checks

- Start the app with `pnpm dev` (or `pnpm build && pnpm start` after a production build), then run `pnpm smoke` to exercise the local Next app API/UI path at `http://localhost:3050`.
- `pnpm readiness:local` checks the local launch surface at `http://localhost:3050`: landing entry points, sample room copy, privacy/billing indexing, private room defaults, invite access, owner controls, upload gating, and legacy API shutdown.
- `pnpm release:local` runs the standard local gate (`verify`, `readiness:local`, and `git diff --check`) before an intentional release. Keep the local dev server running on port `3050` first.
- `pnpm readiness:prod` runs the same readiness contract against `https://www.roomboard.online` in strict mode. Run it after a release, before inviting first users or sending paid traffic.
- `pnpm realtime:prod` reads `https://www.roomboard.online/api/health`, verifies the realtime launch checks are green, then probes the configured Phoenix sidecar `/health` endpoint. Use `PRODUCTION_REALTIME_BASE_URL` or `PRODUCTION_REALTIME_ENDPOINT` only when checking a preview/custom domain intentionally.
- `pnpm realtime:prod:session` is an explicit, mutating production-only check. It verifies the hosted Phoenix health contract, opens one owned room in isolated owner/editor browser contexts, proves live sync, presence, and note fanout, and deletes the room even after failures. It defaults to `https://www.roomboard.online`; only set `PRODUCTION_REALTIME_BASE_URL` when intentionally targeting another HTTPS deployment. It is intentionally excluded from `test`, `verify`, and `release:prod:check`.
- `pnpm release:prod:check` is the final post-release traffic gate. It compares the live deployment commit to `git rev-parse HEAD`, checks Phoenix production health, and then runs the production smoke flow.
- `SMOKE_BASE_URL=https://www.roomboard.online pnpm smoke` runs the same checks against the production showcase. This creates, mutates, uploads to, and closes a real smoke-test room.
- `pnpm smoke:realtime` launches its own Next and Phoenix processes, verifies presence/board fanout, then stops Phoenix to verify the local fallback. It requires the Elixir toolchain and a prior `mix setup` in `realtime/roomboard_realtime/`.

### Production release handoff

Before sending first users or paid traffic, the Vercel production deployment must be the intended release, not an older `main` build. Check the latest production deployment commit, then confirm `https://www.roomboard.online/api/health` exposes the current launch health contract:

- `launchReady: true`
- `launch.checks` with every check marked `ok: true`
- `NEXT_PUBLIC_APP_URL` normalized to `https://www.roomboard.online`
- Supabase room storage and private upload storage enabled
- Phoenix realtime URL configured and signed with the same `ROOMBOARD_REALTIME_SECRET` as the Next app
- server realtime fallback disabled
- support email set to a monitored inbox

For the final production gate, compare the live Vercel commit to the release you meant to ship and run the production smoke flow:

```bash
pnpm release:prod:check
```

When a live collaboration session itself needs verification, run the mutating check separately so its production room lifecycle is intentional:

```bash
pnpm realtime:prod:session
```

If `/api/health` only returns the older basic fields (`ok`, `storage`, `durableStorage`, `realtimeSignedTokens`, `serverRealtimeFallback`), production is stale. Deploy the current app first, then rerun `pnpm release:prod:check`.

Before sharing a public build, follow the canonical production checklist in [`ROADMAP.md`](./ROADMAP.md#release-checklist).
For first-user traffic, campaign positioning, UTM links, DM copy, and tiny paid-ad hypotheses, use [`LAUNCH.md`](./LAUNCH.md).

## Phoenix realtime sidecar

Run Phoenix in a second terminal:

```bash
cd realtime/roomboard_realtime
mix setup
PORT=4001 mix phx.server
```

Run the Next app with the sidecar URL available to the browser:

```bash
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=http://localhost:4001 pnpm dev
```

When that variable is set, Roomboard loads the room snapshot once from Next, receives a short-lived realtime access token, then uses Phoenix Channels for presence plus live board events such as item creation, movement, comments, connections, and room close notifications. If the variable is absent outside production, it falls back to the built-in Next SSE routes.

If the Phoenix sidecar cannot join or loses its socket during local development, the browser degrades to the same local SSE and BroadcastChannel fallback so room edits still flow through the persisted Next APIs. Production disables the server SSE fallback by default so hosted rooms do not hold Vercel Functions open; set `ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK=true` and `NEXT_PUBLIC_ROOMBOARD_ALLOW_SERVER_FALLBACK=true` only for an intentional emergency override or a small early-access cohort while the signed Phoenix secret is being rolled out. Hosted Phoenix requires the same `ROOMBOARD_REALTIME_SECRET` as the Next app; without it, hosted browsers either use the explicit server fallback or avoid joining Phoenix.

### Scaling constraint

The SSE fallback (`lib/presence.ts`, `app/api/rooms/[roomId]/presence`) keeps presence snapshots and stream clients in-process, and `lib/requestRateLimit.ts` falls back to an in-memory bucket map when Supabase is unreachable. Both are correct only while the Next app runs as a single instance. On Vercel, concurrent lambda instances diverge: presence lists differ per instance and rate limits multiply by instance count. Treat this as a single-instance deployment, or move presence to Phoenix (already the default when `NEXT_PUBLIC_ROOMBOARD_REALTIME_URL` is set) and keep `ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK` off in production.

## Persistence

Roomboard uses a document store for room state. Without Supabase env vars, local development persists rooms to `.roomboard-data/rooms.json`.

For a Vercel + Supabase showcase deploy, run `supabase/roomboard-schema.sql`, then set:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Optional:

```bash
ROOMBOARD_SUPABASE_TABLE=roomboard_rooms
ROOMBOARD_UPLOAD_BUCKET=roomboard-uploads
ROOMBOARD_REALTIME_SECRET=shared-random-secret
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_GITHUB_URL=https://github.com/your-org/your-repo
```

Image uploads go through `/api/uploads` after editor access is checked. JPEG, PNG, GIF, and WebP are supported; SVG uploads are rejected. With `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` configured, files are written to the private `roomboard-uploads` Storage bucket and cards use signed asset URLs. Without the server service-role storage env vars, local development falls back to data URLs. Signed asset URLs are refreshed when an authorized room snapshot is loaded.

## Technical walkthrough pieces

The repository still includes SaaS/auth/billing components for a future technical walkthrough, but they are not the main landing-page narrative:

- Supabase Auth sign-in/sign-up through the browser client.
- RLS-backed `roomboard_profiles` upserts and `billing_subscriptions` reads.
- Stripe Checkout Sessions with `mode: "subscription"` and annual Price IDs.
- Stripe Customer Portal session creation for subscription management.
- Stripe webhook ingestion at `/api/billing/webhook` for `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, and `customer.subscription.deleted`.

Run `supabase/roomboard-schema.sql` before enabling Auth in a hosted Supabase project. It creates the profile/subscription tables, indexes, and RLS policies.

Stripe can run in demo mode with no keys: `/api/billing/checkout` returns a local success URL so the UI remains clickable. To use real Stripe test data, create annual recurring Prices in Stripe and set:

```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_TEAM_ANNUAL_PRICE_ID=price_...
STRIPE_STUDIO_ANNUAL_PRICE_ID=price_...
NEXT_PUBLIC_APP_URL=http://localhost:3050
```

For local webhook testing:

```bash
stripe listen --forward-to localhost:3050/api/billing/webhook
```

## Showcase deploy

Use Vercel for the Next app and a small Elixir web service for Phoenix Channels.

1. Create the Supabase project and run `supabase/roomboard-schema.sql`.
2. Deploy the Phoenix sidecar from `render.yaml`, or create an Elixir web service rooted at `realtime/roomboard_realtime`.
3. Set these Vercel env vars:

```bash
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ROOMBOARD_SUPABASE_TABLE=roomboard_rooms
ROOMBOARD_UPLOAD_BUCKET=roomboard-uploads
ROOMBOARD_REALTIME_SECRET=same-random-secret-as-phoenix
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=https://your-phoenix-service.example.com
```

4. Set these Phoenix service env vars:

```bash
PHX_SERVER=true
PHX_HOST=your-phoenix-service.onrender.com
SECRET_KEY_BASE=generated-by-render-or-mix-phx-gen-secret
ROOMBOARD_ALLOWED_ORIGINS=https://your-next-app.vercel.app,https://www.roomboard.online
ROOMBOARD_REALTIME_SECRET=same-random-secret-as-next
```

The sidecar exposes `GET /health` for host health checks. The browser connects to Phoenix at `${NEXT_PUBLIC_ROOMBOARD_REALTIME_URL}/socket` with a signed room token from Next, while Next remains responsible for room snapshots, owner controls, persistence, and uploads.

## Technical walkthrough for employers

Roomboard is intentionally split across a few focused systems so each part of the stack has a clear job in the realtime collaboration flow.

### Next.js App Router

Next.js owns the product shell and HTTP boundary. The App Router renders the dashboard and room routes, including `/rooms/[roomId]`, so every board has a shareable URL. It also exposes the API routes for room creation, room snapshots, owner-only controls, signed realtime access tokens, uploads, and the local realtime fallback used during zero-config development.

In the hosted path, Next remains the source of truth for persisted room documents: the browser loads the room snapshot through Next, sends durable mutations through Next APIs where needed, and lets the realtime layer handle low-latency fanout. This keeps the user-facing app deployable as a standard Vercel project while avoiding a custom backend for the whole product surface.

### Pixi.js canvas

Pixi.js owns the interactive board surface inside the room. It renders draggable note cards, image cards, connectors, selection states, and canvas interactions where DOM-only rendering would become expensive or visually jumpy. The goal is not to build a generic whiteboard; Pixi is used specifically for fast visual decision work such as placing material, moving cards, and keeping relationships readable while the room updates live.

The canvas is client-only because it depends on browser rendering and pointer interaction. Next provides the route and data boundary; Pixi turns the room document into a responsive editing surface.

### Phoenix and Elixir realtime

The Phoenix sidecar owns realtime collaboration when it is configured. Browsers connect to Phoenix Channels at the sidecar socket endpoint, join a room topic with a signed room token, and receive board events for item creation, movement, comments, connections, presence, and room close notifications.

Elixir is used here for the part of the product that benefits from the BEAM: supervised socket processes, cheap fanout, and Phoenix Presence for live collaborator state. If the sidecar is unavailable in local development, the app degrades to the built-in Next Server-Sent Events and BroadcastChannel fallback so the room can still be tested without running the Elixir service.

### Supabase persistence and storage

Supabase is the hosted persistence layer. Room documents are stored in the configured `roomboard_rooms` table, while uploaded image assets are written to the private `roomboard-uploads` Storage bucket after the Next upload route verifies editor access. Cards then reference signed asset URLs instead of embedding large files directly in the room document.

Local development keeps the same product shape without requiring cloud setup: rooms persist to `.roomboard-data/rooms.json`, and image uploads fall back to data URLs when Supabase env vars are absent. That makes the product easy to run locally while keeping a credible path for a hosted showcase.

### Vercel and hosted showcase

Vercel hosts the Next.js app: landing/dashboard UI, room routes, API routes, uploads, and persisted room snapshots. The Phoenix sidecar runs as a small separate Elixir web service, and Supabase provides durable data and file storage. The public showcase wires those pieces together with `NEXT_PUBLIC_ROOMBOARD_REALTIME_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the room/upload configuration vars documented above.

The result is a small but realistic SaaS-shaped architecture: Vercel serves the user-facing application, Phoenix handles live collaboration, Supabase stores rooms and assets, and the Pixi canvas delivers the interaction model that makes the product feel like a visual workspace rather than a form-driven CRUD app.

## Why this shape

Pixi is the canvas renderer: it keeps drag/pan/zoom interactions fast while Next App Router handles the application shell and realtime route handlers.

Rooms use a persisted document model: local JSON for zero-config development, or Supabase for a hosted showcase. The repository also keeps experimental Auth/RLS and Stripe subscription code for a future technical walkthrough without changing the current room workflow.

Elixir owns the realtime collaboration layer that benefits from the BEAM: socket fanout, process supervision, Phoenix Presence, and low-latency board mutation broadcasts. Next owns the app shell, room APIs, and persisted room documents.
