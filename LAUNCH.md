# Roomboard First-User Launch Checklist

Use this checklist before sending first users or paid traffic to Roomboard.

## Product Promise

Roomboard is a launch approval room: put the real page or campaign in one private place, invite the people who can approve it, and leave with a decision record.

The first-user promise is deliberately narrow:

- Open a private locked room.
- Start with a clean launch approval workflow: decision question, real material, criteria, and decision record.
- Add or replace the first real screenshot, image link, reference, or product state before inviting someone.
- Invite editors or viewers.
- Keep feedback, statuses, images, and connector lines attached to the visual work.
- Close the room when the decision is made.

The default homepage and `/for/landing-review` should lead with this launch-approval job. Moodboard and blank rooms remain secondary use cases, not competing homepage promises.

Do not lead with accounts, billing, SaaS architecture, Stripe, or stack proof on the main landing page. Keep that material for a later technical walkthrough.

## Campaign Entry Points

- `https://www.roomboard.online/for/landing-review`
  - Use for founders, marketers, and product teams reviewing a landing page before traffic or launch.
  - Promise: a clean launch approval room for the real material, approval criteria, reviewer calls, and the final decision record.
- `https://www.roomboard.online/for/moodboard`
  - Use for creative direction, brand references, visual exploration, and team alignment.
  - Promise: seeded moodboard room with references, criteria, comments, and a next-step card.
- `https://www.roomboard.online/for/blank-room`
  - Use when the user already has screenshots, product states, or references ready.
  - Promise: clean private room with a first decision prompt, invite links, and owner backup access.

- `https://www.roomboard.online/for/agent-review`
  - Use for builders who want their own AI agent (Claude Code, Codex, any MCP client) to review the real material alongside them.
  - Promise: private decision room that opens straight into agent onboarding — one-time token, paste-ready `claude mcp add` command, transcript, card comments, and a human-signed decision record.

The homepage now leads with launch approval. Paid or targeted traffic should still use the scenario routes so intent and attribution stay explicit.

## First Traffic Batch

Start with a small, measurable batch before any broad spend:

- Send founders/marketers to `https://www.roomboard.online/for/landing-review?utm_source=first_batch&utm_medium=direct&utm_campaign=landing_review`.
- Send creative/design users to `https://www.roomboard.online/for/moodboard?utm_source=first_batch&utm_medium=direct&utm_campaign=moodboard`.
- Send prepared-review users to `https://www.roomboard.online/for/blank-room?utm_source=first_batch&utm_medium=direct&utm_campaign=blank_room`.

Keep the first batch narrow:

- 10-15 hand-picked launch owners before any paid campaign.
- One promise per message: visual decision room, no account gate, invite people, make the decision.
- Ask users to create a room and invite one collaborator, not just inspect the sample room.
- Use one `utm_content` per message or ad so weak copy can be killed without losing the whole scenario.

The private-beta target is not visits. It is:

- 5 real rooms containing the user's own launch material.
- 3 rooms with a collaborator comment or status change.
- 2 rooms closed with every item resolved and at least one collaborator action.
- 2 creators who start a second real decision within 14 days.

Scale only if the first batch shows:

- Room creation works from the campaign entry page.
- At least a few users reach `Room Opened`.
- At least one user reaches `Collaborative Decision Completed`.
- No support messages report lost access, public-room confusion, upload surprise, or account requirement confusion.

Stop and fix before spending more if traffic reaches `Room Created` but not `Room Opened`, or reaches `Room Opened` but not `Room Invite Message Copied`.

## First Batch Copy

Use these as starting messages for the first 10-20 people. Keep them personal, short, and tied to the exact route.

Founder or marketer DM:

```text
I am testing Roomboard with a few founders before opening it wider.

It is a private launch approval room: add the real page or campaign, invite one person who can approve it, and close with a decision record.

Can you try creating one room and inviting one person to comment?
https://www.roomboard.online/for/landing-review?utm_source=first_batch&utm_medium=direct&utm_campaign=landing_review&utm_content=founder_dm
```

Builder-with-agents DM:

```text
I am testing Roomboard agent rooms with a few builders before opening them wider.

It is a private decision room where your own AI agent joins over MCP: paste one command, and it reviews the real cards with you — comments, backs, reports — while you keep the final call.

Can you try connecting one agent to a fresh room?
https://www.roomboard.online/for/agent-review?utm_source=first_batch&utm_medium=direct&utm_campaign=agent_review&utm_content=builder_dm
```

Design or creative DM:

```text
I am testing Roomboard with a small first group.

It gives you a private moodboard room where references, comments, criteria, and the final direction stay attached to the same board instead of a thread.

Can you try creating one room and inviting one person to react?
https://www.roomboard.online/for/moodboard?utm_source=first_batch&utm_medium=direct&utm_campaign=moodboard&utm_content=designer_dm
```

Prepared review DM:

```text
I am testing Roomboard for quick visual decisions.

If you already have screenshots, product states, or references ready, it opens a private room with a first decision prompt, invite links, and owner backup access. No account gate.

Can you create one room, drop in one item, and invite one collaborator?
https://www.roomboard.online/for/blank-room?utm_source=first_batch&utm_medium=direct&utm_campaign=blank_room&utm_content=prepared_review_dm
```

Tiny paid ad hypotheses:

- Landing review:
  - Hook: `Before you send traffic, review the landing page in one private room.`
  - Body: `Add the real launch material, invite one reviewer, and keep the final call in a decision record. No account gate.`
  - URL: `https://www.roomboard.online/for/landing-review?utm_source=first_batch&utm_medium=paid_social&utm_campaign=landing_review&utm_content=landing_before_traffic`
- Moodboard:
  - Hook: `Choose a visual direction without losing the decision in a thread.`
  - Body: `Private moodboard rooms for references, criteria, comments, and the next step. Invite editors or viewers.`
  - URL: `https://www.roomboard.online/for/moodboard?utm_source=first_batch&utm_medium=paid_social&utm_campaign=moodboard&utm_content=direction_without_thread`
- Blank room:
  - Hook: `Send a private visual decision room instead of a scattered screenshot thread.`
  - Body: `Open a room, add your material, copy the invite message, and close the room when the decision is made.`
  - URL: `https://www.roomboard.online/for/blank-room?utm_source=first_batch&utm_medium=paid_social&utm_campaign=blank_room&utm_content=private_visual_review`

Kill copy when:

- It gets clicks but few `Room Start Clicked` events: the promise is interesting but the page or CTA is not matching the hook.
- It gets `Room Created` but few `Room Opened` events: creation or redirect reliability is the issue.
- It gets `Room Opened` but no `Room Invite Message Copied` events: onboarding is still too subtle.
- It gets support mail about accounts, public rooms, or lost access: stop that scenario and fix trust/access copy before sending more people.

## Positioning Copy

Good first lines:

- Visual decision rooms for mockups, images, links, ideas, team feedback, and clear decisions.
- Open a private room, invite the right people, and decide what ships.
- Review a landing page together before traffic hits it.
- Choose a visual direction without a messy thread.
- Bring your own agent: Claude Code or any MCP client reviews the room with you, you sign the decision.
- A decision room for humans and their agents — transcript, card findings, and a record someone owns.

Avoid:

- General whiteboard language.
- Project management positioning.
- "Demo SaaS", pricing, changelog, Stripe, or Auth language on the primary landing flow.
- Claims that accounts are required. The current flow uses local creator tokens and role-specific invite links.

## Release Gates

Local gates before any release:

```bash
pnpm release:local
```

Keep the local dev server running on `http://localhost:3050` before running `pnpm release:local`.

Minimum production env before traffic:

```bash
NEXT_PUBLIC_APP_URL=https://www.roomboard.online
NEXT_PUBLIC_ROOMBOARD_SUPPORT_EMAIL=support@roomboard.online
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
ROOMBOARD_SUPABASE_TABLE=roomboard_rooms
ROOMBOARD_UPLOAD_BUCKET=roomboard-uploads
ROOMBOARD_REALTIME_SECRET=same-secret-in-next-and-phoenix
NEXT_PUBLIC_ROOMBOARD_REALTIME_URL=https://your-phoenix-service.example.com
NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN=phc_your_project_token
NEXT_PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
```

Do not set `ROOMBOARD_ALLOW_SERVER_REALTIME_FALLBACK` or `NEXT_PUBLIC_ROOMBOARD_ALLOW_SERVER_FALLBACK` in production unless you are intentionally running a short emergency cohort without Phoenix.

Production gates after release and before traffic:

```bash
pnpm release:prod:check
```

That command runs strict production readiness against the current `git rev-parse HEAD`, then runs the production smoke flow against `https://www.roomboard.online`.

Also verify:

- `https://www.roomboard.online/api/health` returns `launchReady: true` with `analyticsConfigured: true`.
- The Phoenix sidecar health endpoint is healthy. Its Render instance sleeps when idle and takes over a minute to wake, and production runs with the server realtime fallback disabled, so a cold start means a first visitor opens a room with no presence and no live updates. The `Realtime keepalive` workflow pings `/health` every 10 minutes and the landing page prewarms the endpoint on load, but GitHub can delay scheduled runs — before a traffic batch, hit the health endpoint yourself and confirm it answers in under a second. If cold starts still show up once real traffic arrives, move the sidecar to an always-on paid instance.
- The production app and Phoenix sidecar share `ROOMBOARD_REALTIME_SECRET`.
- The support inbox at `support@roomboard.online` is receiving mail, or `NEXT_PUBLIC_ROOMBOARD_SUPPORT_EMAIL` points to a working monitored inbox.
- Room creation from each campaign page creates a private locked room.
- A bare room link is blocked until an editor or viewer invite is used.
- Viewer invite can read but cannot mutate.
- Owner can copy invite message, owner backup, editor link, and viewer link.
- PostHog is the single analytics sink and receives launch-funnel events without room IDs, room names, invite tokens, owner tokens, filenames, image URLs, display names, messages, or card content. Autocapture, pageview capture, and session recording remain disabled.
- After deploying, do one manual live check: open a campaign route in an incognito browser, click a room CTA, and confirm `Room Start Clicked` appears in the PostHog project's live events within a minute.

## First-User Signal Review

After the first traffic batch, look for this funnel:

1. `Campaign Attributed`
2. `Room Start Clicked`
3. `Room Created`
4. `Room Opened` after the room snapshot loads
5. `Room Display Name Saved`
6. `Room First Card Created` or `Room Upload Completed`
7. `Room Invite Message Copied`
8. `Room Comment Created`, `Room Card Status Changed`, or `Room Recap Copied`
9. `Collaborative Decision Completed`

`Collaborative Decision Completed` fires only when the owner closes a room from the room surface, every card is resolved (`approved` or `changes_requested`), and at least one comment or status-change activity came from someone other than the current owner. Its properties are counts, booleans, role, and starter only; it does not include room IDs, names, participant names, card content, or links. `Room Decision Closed` fires for every successful close from that surface so incomplete and owner-only closes remain measurable without inflating the success metric.

This funnel is already built in the Roomboard PostHog project on the pinned [Launch — first-user funnel](https://us.posthog.com/project/570767/dashboard/2022815) dashboard, as two insights:

- [Launch funnel — campaign-attributed](https://us.posthog.com/project/570767/insights/BW5jf4m6) is the canonical 8-step sequence above. It starts at `Campaign Attributed`, which only fires when the URL carries UTM params, so it measures the DM and paid batches and stays empty for organic or direct visits.
- [Launch funnel — activation core](https://us.posthog.com/project/570767/insights/pIXcqfpI) is the same sequence minus step 1, starting at `Room Start Clicked`. Read this one for any traffic that is not campaign-tagged.

The pinned dashboard still contains the original eight-step acquisition/activation funnels. Add `Collaborative Decision Completed` as the ninth step only after the updated build is deployed and one real or explicitly tagged preflight event confirms ingestion. Step 6 remains an OR group over `Room First Card Created` and `Room Upload Completed`; step 8 remains an OR group over `Room Comment Created`, `Room Card Status Changed`, and `Room Recap Copied`.

Exclude synthetic verification traffic from beta evidence. Run preflight links with `utm_source=launch_check&utm_campaign=preflight`, and filter out `campaignSource = launch_check` or `campaignName = preflight` in the decision-completion and retention views.

Break down by `landingPath`, which is present on the events today. `campaignName` is only attached once a visitor arrives with UTM params, so that breakdown becomes usable after the first campaign batch, not before.

Before sending traffic, walk the whole flow yourself in an incognito window through a campaign URL and verify every step shows at least one event. If a step stays empty after that walkthrough, the event contract drifted — fix instrumentation before spending on acquisition.

If users stop before `Room Opened`, fix landing/create reliability. If they stop before `Room Invite Message Copied`, fix onboarding. If they stop before comments or status changes, fix the invite copy and first-room prompt.

`Room Open Requested` is only a navigation intent from the rooms console. Do not count it as activation until `Room Opened` fires from the room surface.

Use this triage map before changing copy or buying more traffic:

| Drop-off | Likely meaning | Check first | Action |
| --- | --- | --- | --- |
| Clicks but no `Room Start Clicked` | The ad/DM promise and landing CTA do not match. | Campaign URL, hero headline, visible CTA, mobile first viewport. | Stop that `utm_content`; tighten the promise or route users to the better scenario page. |
| `Room Start Clicked` but no `Room Created` | Create request failed or rate/storage/env blocked it. | `/api/health`, Vercel runtime errors, room create response, support messages. | Stop paid traffic; fix reliability before copy changes. |
| `Room Created` but no `Room Opened` | Redirect, owner token, or browser storage recovery failed. | Owner-token hash link, `/rooms/[roomId]` load, launch guide visibility. | Treat as launch blocker; do not ask more people until fixed. |
| `Room Opened` but no `Room Display Name Saved` | Display-name prompt is unclear or too early. | Display-name modal copy, mobile fit, pending action copy. | Simplify join copy before changing the landing page. |
| `Room Display Name Saved` but no first card/upload | The user does not know what to put on the board. | Starter page match, seeded cards, launch guide first-card CTA. | Improve starter-specific onboarding or send users to a seeded route. |
| First card/upload but no `Room Invite Message Copied` | Sharing is still too hidden or scary. | Primary Share button, launch guide checklist, owner backup copy. | Fix in-room onboarding before sending more users. |
| Invite copied but no collaborator action | Invite message or viewer/editor role is wrong. | Copied invite text, editor vs viewer token, support replies. | Rewrite invite message and test in a second browser. |
| Collaborator action but no `Collaborative Decision Completed` | The room stayed unresolved or the owner did not close the decision from the room. | Open/reviewing cards, decision record, close action. | Make unresolved work obvious and ask the owner to close only after the call is explicit. |
| Support asks about accounts/public rooms/lost access | Trust/access model is unclear. | FAQ, privacy page, room locked banner, owner backup copy. | Stop that scenario and fix trust/access copy. |

## Do Not Launch If

- `/for/landing-review`, `/for/moodboard`, `/for/blank-room`, or `/for/agent-review` return 404.
- `pnpm readiness:prod` fails.
- `pnpm smoke:agents` fails against the deployment.
- `https://www.roomboard.online/api/health` does not expose the current launch health contract: `launchReady` plus `launch.checks`.
- `launchReady` is missing or false in production health.
- Newly created rooms appear in `/api/rooms` without owner or invite tokens.
- Sample rooms appear in active room lists.
- The landing page shows SaaS/Auth/Stripe proof as the main narrative.
- The product requires an account to create, join, or return to the current browser's room.
- Upload privacy copy contradicts the current private bucket/signed URL behavior.
- Analytics events include room IDs, room names, invite tokens, owner tokens, filenames, image URLs, display names, messages, or card content.
- The support email shown in the footer and privacy page is not monitored.

## Operating Rule

Work locally first. Do not deploy after every small copy or UI adjustment, and do not treat production as the preview surface.

Preferred flow:

1. Make local changes.
2. Run local verification.
3. Review the local app at `http://localhost:3050`.
4. Sync/merge safely.
5. Do one intentional release only after an explicit release decision.
6. Run production readiness.
7. Start sharing links only after the production gates pass.
