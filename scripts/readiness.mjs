import { readFileSync } from "node:fs";

const baseUrl = (
  process.env.READINESS_BASE_URL ??
  process.env.SMOKE_BASE_URL ??
  "https://www.roomboard.online"
).replace(/\/$/, "");
const strict = process.argv.includes("--strict") || process.env.READINESS_STRICT === "true";
const demoRoomId = "pitch-deck-review";
const moodboardDemoRoomId = "sample-moodboard-decision";
const visualDecisionDemoRoomId = "sample-visual-decision-room";
const demoRoomIds = new Set([demoRoomId, moodboardDemoRoomId, visualDecisionDemoRoomId]);
const existingRoomId = process.env.READINESS_ROOM_ID;
const existingOwnerToken = process.env.READINESS_OWNER_TOKEN;
const expectedGitSha = process.env.READINESS_EXPECTED_GIT_SHA?.trim();
const supportEmail = process.env.READINESS_SUPPORT_EMAIL ?? "support@roomboard.online";
const warnings = [];

function fail(message) {
  throw new Error(message);
}

function assert(condition, message) {
  if (!condition) fail(message);
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}${path}`, {
      ...options,
      headers: {
        ...(typeof options.body === "string" ? { "Content-Type": "application/json" } : {}),
        ...(options.headers ?? {}),
      },
    });
  } catch (error) {
    const method = options.method ?? "GET";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${method} ${path} failed against ${baseUrl}: ${message}`);
  }

  let body = null;
  const text = await response.text();
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { body, response };
}

async function assertStatus(path, expectedStatus, options = {}) {
  const result = await request(path, options);
  assert(
    result.response.status === expectedStatus,
    `${options.method ?? "GET"} ${path} returned ${result.response.status}, expected ${expectedStatus}`,
  );
  return result;
}

async function fetchResource(path, options = {}) {
  try {
    return await fetch(`${baseUrl}${path}`, options);
  } catch (error) {
    const method = options.method ?? "GET";
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${method} ${path} failed against ${baseUrl}: ${message}`);
  }
}

function assertTextIncludes(text, expected, context) {
  const searchable = typeof text === "string" ? text.replace(/<!--\s*-->/g, "") : text;
  assert(typeof searchable === "string" && searchable.includes(expected), `${context} should include "${expected}"`);
}

function assertTextExcludes(text, unexpected, context) {
  const searchable = typeof text === "string" ? text.replace(/<!--\s*-->/g, "") : text;
  assert(
    typeof searchable === "string" && !searchable.includes(unexpected),
    `${context} should not include "${unexpected}"`,
  );
}

function assertLandingDoesNotPersistAppTheme() {
  const landingSource = readFileSync(new URL("../components/LandingPage.tsx", import.meta.url), "utf8");
  assertTextExcludes(landingSource, "roomboard-theme", "Landing page source");
}

function assertLandingCreatesLaunchApprovalRoom() {
  const landingSource = readFileSync(new URL("../components/LandingPage.tsx", import.meta.url), "utf8");
  const roomSource = readFileSync(new URL("../lib/canvasRoom.ts", import.meta.url), "utf8");
  assertTextIncludes(landingSource, 'initialStarter = "landing-review"', "Landing general start behavior");
  assertTextIncludes(landingSource, 'starter.id === "landing-review"', "Landing general start behavior");
  assertTextIncludes(landingSource, "trackedStarter", "Landing general start analytics");
  assertTextIncludes(roomSource, "Visual to approve", "Launch approval starter");
  assertTextIncludes(roomSource, "Approval criteria", "Launch approval starter");
  assertTextIncludes(roomSource, "Decision record", "Launch approval starter");
  assertTextIncludes(roomSource, 'author: "Roomboard"', "Launch approval starter");
}

function assertMarketingMetadataCopy() {
  const layoutSource = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const ogImageSource = readFileSync(new URL("../app/opengraph-image.tsx", import.meta.url), "utf8");

  assertTextIncludes(layoutSource, "Roomboard - Launch Approval Room", "Marketing metadata");
  assertTextIncludes(
    layoutSource,
    "Put the real launch material in one private room, invite the people who need to approve it, and close with a decision record.",
    "Marketing metadata",
  );
  assertTextExcludes(layoutSource, "visual feedback", "Marketing metadata");
  assertTextExcludes(layoutSource, "creative feedback", "Marketing metadata");
  assertTextIncludes(ogImageSource, "Get the launch decision.", "OpenGraph image copy");
  assertTextIncludes(ogImageSource, "Close the loop.", "OpenGraph image copy");
  assertTextIncludes(ogImageSource, "leave with a decision record", "OpenGraph image copy");
}

function assertRoomsConsoleDefaults() {
  const dashboardSource = readFileSync(new URL("../components/RoomsDashboard.tsx", import.meta.url), "utf8");
  assertTextIncludes(dashboardSource, 'useState<DashboardStarterId>("blank")', "Rooms console default starter");
  assertTextIncludes(dashboardSource, 'name: "Visual decision room"', "Rooms console default room name");
  assertTextIncludes(dashboardSource, "Clean room + first decision guide", "Rooms console blank starter note");
  assertTextIncludes(dashboardSource, "help make the decision here", "Rooms console invite message");
  assertTextIncludes(dashboardSource, "Delete permanently", "Rooms console data deletion");
  assertTextIncludes(dashboardSource, "?permanent=true", "Rooms console data deletion");
  assertTextExcludes(dashboardSource, 'name: "Design review"', "Rooms console default room name");
  assertTextExcludes(dashboardSource, "Moodboard pass", "Rooms console starter copy");
  assertTextExcludes(dashboardSource, "Please review the material", "Rooms console invite message");
}

function assertFirstRoomProfileCopy() {
  const lifecycleSource = readFileSync(new URL("../lib/lifecycleCopy.ts", import.meta.url), "utf8");
  const canvasSource = readFileSync(new URL("../components/CanvasRoom.tsx", import.meta.url), "utf8");
  const roomModelSource = readFileSync(new URL("../lib/canvasRoom.ts", import.meta.url), "utf8");
  assertTextIncludes(lifecycleSource, "Choose your display name", "First room profile copy");
  assertTextIncludes(lifecycleSource, "Enter room", "First room profile copy");
  assertTextIncludes(lifecycleSource, "owner backup", "First room profile copy");
  assertTextIncludes(lifecycleSource, "No account is needed", "First room profile copy");
  assertTextExcludes(lifecycleSource, "Set up your creator profile", "First room profile copy");
  assertTextExcludes(lifecycleSource, "Join as owner", "First room profile copy");
  assertTextIncludes(canvasSource, "Visual decision starter", "First room launch guide copy");
  assertTextIncludes(canvasSource, "Add the visual material first.", "First room launch guide copy");
  assertTextIncludes(canvasSource, "Add real visual material before inviting", "First room launch guide copy");
  assertTextIncludes(canvasSource, "Prompts ready", "First room launch guide copy");
  assertTextIncludes(canvasSource, "visual material prompt", "First room launch guide copy");
  assertTextIncludes(canvasSource, "feedback prompt", "First room launch guide copy");
  assertTextIncludes(canvasSource, "final decision card", "First room launch guide copy");
  assertTextIncludes(
    canvasSource,
    "Add the decision question first, then copy the invite",
    "First room launch guide copy",
  );
  assertTextIncludes(canvasSource, 'useState<RoomVisibility>("private")', "First room privacy default");
  assertTextIncludes(canvasSource, 'snapshot.room?.visibility ?? "private"', "First room privacy default");
  assertTextIncludes(canvasSource, 'event.room.visibility ?? "private"', "First room privacy default");
  assertTextIncludes(
    roomModelSource,
    'room.visibility === "public" ? "public" : "private"',
    "Room model privacy default",
  );
  assertTextIncludes(roomModelSource, 'visibility: room.visibility ?? "private"', "Room model privacy default");
  assertTextIncludes(canvasSource, "Room Display Name Saved", "First room analytics copy");
  assertTextIncludes(canvasSource, "Delete permanently", "First room data deletion");
  assertTextIncludes(canvasSource, "?permanent=true", "First room data deletion");
  assertTextIncludes(roomModelSource, "roomCapacityLimits", "Room document capacities");
  assertTextExcludes(canvasSource, "Room Profile Saved", "First room analytics copy");
}

function assertSmokeProtectsCurrentPositioning() {
  const smokeSource = readFileSync(new URL("./smoke.mjs", import.meta.url), "utf8");
  assertTextIncludes(smokeSource, "get the launch decision", "Smoke landing positioning");
  assertTextIncludes(smokeSource, "enter room", "Smoke first-room profile copy");
  assertTextIncludes(smokeSource, "Start with the decision question.", "Smoke launch guide copy");
  assertTextIncludes(smokeSource, "Add the decision question first, then copy the invite.", "Smoke launch guide copy");
  assertTextIncludes(smokeSource, "?permanent=true", "Smoke data cleanup");
  assertTextExcludes(smokeSource, "review visuals together", "Smoke landing positioning");
  assertTextExcludes(smokeSource, "join (room|as owner|as editor|as viewer)", "Smoke first-room profile copy");
  assertTextExcludes(smokeSource, "Start with one card.", "Smoke launch guide copy");
}

function assertSourceDocsProtectCurrentPositioning() {
  const readmeSource = readFileSync(new URL("../README.md", import.meta.url), "utf8");
  const launchSource = readFileSync(new URL("../LAUNCH.md", import.meta.url), "utf8");
  const roadmapSource = readFileSync(new URL("../ROADMAP.md", import.meta.url), "utf8");

  assertTextIncludes(readmeSource, "Roomboard is a launch approval room", "README positioning");
  assertTextIncludes(readmeSource, "first real visual material", "README first-room guide");
  assertTextIncludes(launchSource, "launch approval room", "Launch positioning");
  assertTextIncludes(launchSource, "first decision prompt", "Launch blank-room promise");
  assertTextIncludes(launchSource, "Room Display Name Saved", "Launch funnel");
  assertTextExcludes(launchSource, "Room Profile Saved", "Launch funnel");
  assertTextIncludes(roadmapSource, "launch approval rooms", "Roadmap positioning");
  assertTextExcludes(roadmapSource, "realtime visual review rooms", "Roadmap positioning");
}

function assertAnalyticsDoesNotStorePrivatePaths() {
  const analyticsSource = readFileSync(new URL("../lib/productAnalytics.ts", import.meta.url), "utf8");
  const posthogSource = readFileSync(new URL("../instrumentation-client.ts", import.meta.url), "utf8");
  assertTextIncludes(analyticsSource, "getSafeLandingPath", "Analytics private path guard");
  assertTextIncludes(analyticsSource, 'pathname.startsWith("/for/")', "Analytics private path guard");
  assertTextIncludes(
    analyticsSource,
    "...(safeLandingPath ? { landingPath: safeLandingPath } : {})",
    "Analytics private path guard",
  );
  assertTextExcludes(analyticsSource, "landingPath: window.location.pathname", "Analytics private path guard");
  assertTextIncludes(posthogSource, "autocapture: false", "PostHog private room guard");
  assertTextIncludes(posthogSource, "capture_pageview: false", "PostHog private room guard");
  assertTextIncludes(posthogSource, "disable_session_recording: true", "PostHog private room guard");
}

function assertLaunchFunnelEvents() {
  const canvasSource = readFileSync(new URL("../components/CanvasRoom.tsx", import.meta.url), "utf8");
  const dashboardSource = readFileSync(new URL("../components/RoomsDashboard.tsx", import.meta.url), "utf8");
  const landingSource = readFileSync(new URL("../components/LandingPage.tsx", import.meta.url), "utf8");
  const analyticsSource = readFileSync(new URL("../lib/productAnalytics.ts", import.meta.url), "utf8");
  const launchSource = readFileSync(new URL("../LAUNCH.md", import.meta.url), "utf8");

  for (const eventName of [
    "Campaign Attributed",
    "Room Start Clicked",
    "Room Created",
    "Room Opened",
    "Room Display Name Saved",
    "Room First Card Created",
    "Room Upload Completed",
    "Room Invite Message Copied",
    "Room Comment Created",
    "Room Card Status Changed",
    "Room Recap Copied",
  ]) {
    assertTextIncludes(launchSource, eventName, "Launch funnel docs");
  }

  assertTextIncludes(analyticsSource, 'sendProductEvent("Campaign Attributed"', "Launch funnel analytics");
  assertTextIncludes(landingSource, 'trackProductEvent("Room Start Clicked"', "Launch funnel landing events");
  assertTextIncludes(landingSource, 'trackProductEvent("Room Created"', "Launch funnel landing events");
  assertTextIncludes(dashboardSource, 'trackProductEvent("Room Start Clicked"', "Launch funnel dashboard events");
  assertTextIncludes(dashboardSource, 'trackProductEvent("Room Created"', "Launch funnel dashboard events");
  assertTextIncludes(
    dashboardSource,
    'trackProductEvent("Room Invite Message Copied"',
    "Launch funnel dashboard events",
  );
  assertTextIncludes(canvasSource, 'trackRoomActivationEvent("Room Opened"', "Launch funnel room events");
  assertTextIncludes(canvasSource, 'trackRoomActivationEvent("Room Display Name Saved"', "Launch funnel room events");
  assertTextIncludes(canvasSource, '"Room First Card Created"', "Launch funnel room events");
  // Deriving the activation step from an empty board silently killed it on the
  // seeded starters, which is most of the campaign traffic.
  assertTextIncludes(canvasSource, "resolveFirstCardEventName(roomId", "Launch funnel activation step");
  assertTextExcludes(canvasSource, "const isFirstCard = items.length === 0", "Launch funnel activation step");
  assertTextIncludes(canvasSource, 'trackRoomActivationEvent("Room Upload Completed"', "Launch funnel room events");
  assertTextIncludes(canvasSource, 'trackProductEvent("Room Invite Message Copied"', "Launch funnel room events");
  assertTextIncludes(canvasSource, 'trackRoomActivationEvent("Room Comment Created"', "Launch funnel room events");
  assertTextIncludes(canvasSource, 'trackRoomActivationEvent("Room Card Status Changed"', "Launch funnel room events");
  assertTextIncludes(canvasSource, 'trackProductEvent("Room Recap Copied"', "Launch funnel room events");
}

function uploadForm(roomId, tokenName, token) {
  const formData = new FormData();
  formData.append("roomId", roomId);
  formData.append("file", new File([Buffer.from([1, 2, 3])], "readiness-upload.png", { type: "image/png" }));
  if (tokenName && token) {
    formData.append(tokenName, token);
  }
  return formData;
}

async function assertStarterCreateContract(template, expected) {
  const createResult = await request("/api/rooms", {
    body: JSON.stringify({
      name: `Readiness ${template} ${Date.now()}`,
      starterTemplate: template,
    }),
    method: "POST",
  });
  assert(createResult.response.ok, `${template} starter create returned ${createResult.response.status}`);

  const created = createResult.body;
  const roomId = created?.room?.id;
  const ownerToken = created?.ownerToken;
  assert(
    roomId && ownerToken,
    `${template} starter create response missing room/ownerToken: ${JSON.stringify(created)}`,
  );
  assert(created.room.access === "locked", `${template} starter should be locked, got ${created.room.access}`);
  assert(
    created.room.visibility === "private",
    `${template} starter should be private, got ${created.room.visibility}`,
  );
  assert(
    created.room.itemCount === expected.itemCount,
    `${template} starter item count drifted: ${created.room.itemCount}`,
  );
  assert(
    created.room.connectionCount === expected.connectionCount,
    `${template} starter connection count drifted: ${created.room.connectionCount}`,
  );

  const bareSnapshot = await request(`/api/rooms/${roomId}`);
  assert(
    bareSnapshot.response.status === 403,
    `${template} starter bare snapshot returned ${bareSnapshot.response.status}`,
  );

  const ownerSnapshot = await request(`/api/rooms/${roomId}`, {
    headers: { "X-Room-Owner-Token": ownerToken },
  });
  assert(ownerSnapshot.response.ok, `${template} starter owner snapshot returned ${ownerSnapshot.response.status}`);
  assert(
    ownerSnapshot.body?.permissions?.role === "owner",
    `${template} starter owner snapshot did not include owner role`,
  );
  for (const itemId of expected.itemIds) {
    assert(
      ownerSnapshot.body?.items?.some((item) => item.id === itemId),
      `${template} starter missing expected item ${itemId}`,
    );
  }
  for (const forbiddenText of expected.forbiddenTexts ?? []) {
    assert(
      !JSON.stringify(ownerSnapshot.body).includes(forbiddenText),
      `${template} starter should not include "${forbiddenText}"`,
    );
  }

  const cleanup = await request(`/api/rooms/${roomId}?permanent=true`, {
    headers: { "X-Room-Owner-Token": ownerToken },
    method: "DELETE",
  });
  assert(cleanup.response.ok, `${template} starter cleanup returned ${cleanup.response.status}`);
}

async function main() {
  let createdRoomId = "";
  let ownerToken = "";
  let shouldCleanup = false;

  try {
    assertLandingDoesNotPersistAppTheme();
    assertLandingCreatesLaunchApprovalRoom();
    assertMarketingMetadataCopy();
    assertRoomsConsoleDefaults();
    assertFirstRoomProfileCopy();
    assertSmokeProtectsCurrentPositioning();
    assertSourceDocsProtectCurrentPositioning();
    assertAnalyticsDoesNotStorePrivatePaths();
    assertLaunchFunnelEvents();

    const healthResult = await request("/api/health");
    assert(healthResult.response.ok, `Health returned ${healthResult.response.status}`);
    const health = healthResult.body;
    assert(health?.ok === true, `Health did not report ok: ${JSON.stringify(health)}`);
    const launchChecks = Array.isArray(health?.launch?.checks) ? health.launch.checks : [];
    const failedLaunchChecks = launchChecks.filter((check) => check && check.ok !== true);
    const hasLaunchHealthContract = typeof health?.launchReady === "boolean" && Array.isArray(health?.launch?.checks);
    const deployedGitSha = typeof health?.deployment?.gitCommitSha === "string" ? health.deployment.gitCommitSha : "";

    if (strict) {
      assert(
        hasLaunchHealthContract,
        `Strict mode requires the current launch health contract. Deploy the current app before traffic: ${JSON.stringify(
          {
            health,
            missing: ["launchReady", "launch.checks"].filter((key) => {
              if (key === "launchReady") return typeof health?.launchReady !== "boolean";
              return !Array.isArray(health?.launch?.checks);
            }),
          },
        )}`,
      );
      if (expectedGitSha) {
        assert(
          Boolean(deployedGitSha) &&
            (deployedGitSha.startsWith(expectedGitSha) || expectedGitSha.startsWith(deployedGitSha)),
          `Production deployment commit does not match READINESS_EXPECTED_GIT_SHA: ${JSON.stringify({
            deployed: deployedGitSha || null,
            expected: expectedGitSha,
          })}`,
        );
      }
      assert(
        health.launchReady === true,
        `Strict mode requires launchReady=true: ${JSON.stringify({
          checks: failedLaunchChecks,
          health,
        })}`,
      );
      assert(
        health.analyticsConfigured === true,
        "Strict mode requires analyticsConfigured=true: set NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN and NEXT_PUBLIC_POSTHOG_HOST in this environment before launch traffic.",
      );
    } else {
      for (const check of failedLaunchChecks) {
        warnings.push(`${check.key}: ${check.summary} ${check.remediation}`);
      }
    }

    const homeResult = await request("/");
    assert(homeResult.response.ok, `Home page returned ${homeResult.response.status}`);
    assert(
      typeof homeResult.body === "string" &&
        homeResult.body.includes('href="/rooms"') &&
        homeResult.body.includes("My rooms"),
      "Home page should link to the rooms console for returning users",
    );
    assertTextIncludes(homeResult.body, '<link rel="canonical" href="https://www.roomboard.online"/>', "Home page");
    assertTextIncludes(homeResult.body, `mailto:${supportEmail}`, "Home page support link");
    assertTextIncludes(homeResult.body, "subject=Roomboard%20support", "Home page support link");
    assertTextIncludes(homeResult.body, "Launch Approval Room", "Home page hero");
    assertTextIncludes(homeResult.body, "Get the launch decision.", "Home page hero");
    assertTextIncludes(homeResult.body, "Without the screenshot thread.", "Home page hero");
    assertTextIncludes(homeResult.body, "Put the real launch material in one private room", "Home page hero");
    assertTextIncludes(homeResult.body, "close with a decision record", "Home page hero");
    assertTextIncludes(homeResult.body, "Start launch approval", "Home page room starters");
    assertTextIncludes(homeResult.body, "Start moodboard", "Home page room starters");
    assertTextIncludes(homeResult.body, "Start blank room", "Home page room starters");
    assertTextIncludes(homeResult.body, "Launch Approval", "Home page preview");
    assertTextIncludes(homeResult.body, "Hero approved", "Home page preview");
    assertTextIncludes(homeResult.body, "Ship the focused version", "Home page preview");
    assertTextIncludes(homeResult.body, "See a finished decision", "Home page sample CTA");
    assertTextExcludes(homeResult.body, "Start with", "Home page");
    assertTextExcludes(homeResult.body, "Choose a room starter", "Home page");
    assertTextExcludes(homeResult.body, "Opens with", "Home page");
    assertTextExcludes(homeResult.body, "visual feedback", "Home page hero");
    assertTextExcludes(homeResult.body, "Private Visual Feedback Room", "Home page hero");
    assertTextExcludes(homeResult.body, "Review visuals together.", "Home page hero");
    assertTextExcludes(homeResult.body, "Campaign links", "Home page");
    assertTextExcludes(homeResult.body, "Stripe subscriptions", "Home page");

    const robotsResult = await request("/robots.txt");
    assert(robotsResult.response.ok, `Robots returned ${robotsResult.response.status}`);
    assertTextIncludes(robotsResult.body, "Allow: /for/", "Robots");
    assertTextIncludes(robotsResult.body, "Allow: /privacy", "Robots");
    assertTextIncludes(robotsResult.body, "Disallow: /api/", "Robots");
    assertTextIncludes(robotsResult.body, "Disallow: /billing/", "Robots");
    assertTextIncludes(robotsResult.body, "Disallow: /rooms/", "Robots");
    assertTextIncludes(robotsResult.body, "Sitemap: https://www.roomboard.online/sitemap.xml", "Robots");

    const sitemapResult = await request("/sitemap.xml");
    assert(sitemapResult.response.ok, `Sitemap returned ${sitemapResult.response.status}`);
    assertTextIncludes(sitemapResult.body, "<loc>https://www.roomboard.online</loc>", "Sitemap");
    assertTextIncludes(sitemapResult.body, "<loc>https://www.roomboard.online/for/landing-review</loc>", "Sitemap");
    assertTextIncludes(sitemapResult.body, "<loc>https://www.roomboard.online/for/moodboard</loc>", "Sitemap");
    assertTextIncludes(sitemapResult.body, "<loc>https://www.roomboard.online/for/blank-room</loc>", "Sitemap");
    assertTextIncludes(sitemapResult.body, "<loc>https://www.roomboard.online/privacy</loc>", "Sitemap");
    assertTextExcludes(sitemapResult.body, "/rooms/", "Sitemap");
    assertTextExcludes(sitemapResult.body, "/billing/", "Sitemap");

    const ogImageResponse = await fetchResource("/opengraph-image");
    assert(ogImageResponse.ok, `OpenGraph image returned ${ogImageResponse.status}`);
    assert(
      ogImageResponse.headers.get("content-type")?.includes("image/png"),
      `OpenGraph image should be image/png, got ${ogImageResponse.headers.get("content-type")}`,
    );
    const ogImageBytes = await ogImageResponse.arrayBuffer();
    assert(ogImageBytes.byteLength > 10_000, `OpenGraph image looks too small: ${ogImageBytes.byteLength} bytes`);

    const campaignLandingResult = await request("/for/landing-review");
    assert(campaignLandingResult.response.ok, `/for/landing-review returned ${campaignLandingResult.response.status}`);
    assertTextIncludes(campaignLandingResult.body, "Approve what ships before launch", "/for/landing-review metadata");
    assertTextIncludes(
      campaignLandingResult.body,
      "Open a private launch approval room with a clean workflow",
      "/for/landing-review metadata",
    );
    assertTextIncludes(campaignLandingResult.body, "Decide what ships.", "/for/landing-review");
    assertTextIncludes(campaignLandingResult.body, "See a finished decision", "/for/landing-review");
    assertTextIncludes(
      campaignLandingResult.body,
      "/for/landing-review/opengraph-image",
      "/for/landing-review metadata",
    );
    assertTextExcludes(campaignLandingResult.body, "Choose a room starter", "/for/landing-review");
    assertTextExcludes(campaignLandingResult.body, "Opens with", "/for/landing-review");
    assertTextIncludes(campaignLandingResult.body, "No account needed", "/for/landing-review");
    assertTextExcludes(campaignLandingResult.body, "Campaign links", "/for/landing-review");
    assertTextExcludes(campaignLandingResult.body, "creative feedback", "/for/landing-review");
    assertTextExcludes(campaignLandingResult.body, "visual feedback", "/for/landing-review");
    assertTextExcludes(campaignLandingResult.body, "the user", "/for/landing-review");
    assertTextExcludes(campaignLandingResult.body, "Stripe subscriptions", "/for/landing-review");
    const campaignLandingOgImageResponse = await fetchResource("/for/landing-review/opengraph-image");
    assert(
      campaignLandingOgImageResponse.ok,
      `Landing campaign OpenGraph image returned ${campaignLandingOgImageResponse.status}`,
    );
    assert(
      campaignLandingOgImageResponse.headers.get("content-type")?.includes("image/png"),
      `Landing campaign OpenGraph image should be image/png, got ${campaignLandingOgImageResponse.headers.get("content-type")}`,
    );
    await campaignLandingOgImageResponse.body?.cancel();

    const sampleRoomResult = await request(`/api/rooms/${demoRoomId}`);
    assert(sampleRoomResult.response.ok, `Sample room returned ${sampleRoomResult.response.status}`);
    assert(
      sampleRoomResult.body?.room?.name === "Launch Approval — Decision Complete",
      `Sample room name drifted: ${sampleRoomResult.body?.room?.name}`,
    );
    assert(
      Array.isArray(sampleRoomResult.body?.items) && sampleRoomResult.body.items.length >= 5,
      `Sample room should include a seeded landing review board: ${JSON.stringify(sampleRoomResult.body)}`,
    );
    assert(
      sampleRoomResult.body.items.some((item) => item.id === "note-decision-record"),
      "Sample room should include the completed decision record",
    );
    assert(
      !JSON.stringify(sampleRoomResult.body).includes("employer demo"),
      "Sample room should not include old employer demo copy",
    );
    assert(
      !JSON.stringify(sampleRoomResult.body).includes("fake case-study"),
      "Sample room should not include old fake-case-study copy",
    );
    const sampleRoomPageResult = await request(`/rooms/${demoRoomId}`);
    assert(sampleRoomPageResult.response.ok, `Sample room page returned ${sampleRoomPageResult.response.status}`);
    assertTextIncludes(sampleRoomPageResult.body, "noindex", "Sample room page");
    assertTextIncludes(sampleRoomPageResult.body, `mailto:${supportEmail}`, "Sample room page support link");
    assertTextIncludes(sampleRoomPageResult.body, "Room%20context%3A%20Room%20canvas", "Sample room page support link");
    assertTextExcludes(
      sampleRoomPageResult.body,
      "Launch Approval — Decision Complete — snapshot",
      "Sample room page metadata",
    );

    const moodboardLandingResult = await request("/for/moodboard");
    assert(moodboardLandingResult.response.ok, `/for/moodboard returned ${moodboardLandingResult.response.status}`);
    assertTextIncludes(
      moodboardLandingResult.body,
      "Choose a visual direction without a messy thread",
      "/for/moodboard metadata",
    );
    assertTextIncludes(
      moodboardLandingResult.body,
      "Open a private moodboard decision room",
      "/for/moodboard metadata",
    );
    assertTextIncludes(moodboardLandingResult.body, "Moodboard Decision", "/for/moodboard");
    assertTextIncludes(moodboardLandingResult.body, "View moodboard sample", "/for/moodboard");
    assertTextIncludes(moodboardLandingResult.body, "/for/moodboard/opengraph-image", "/for/moodboard metadata");
    assertTextExcludes(moodboardLandingResult.body, "Choose a room starter", "/for/moodboard");
    assertTextExcludes(moodboardLandingResult.body, "Opens with", "/for/moodboard");
    assertTextExcludes(moodboardLandingResult.body, "creative feedback", "/for/moodboard");
    assertTextExcludes(moodboardLandingResult.body, "visual feedback", "/for/moodboard");
    const moodboardOgImageResponse = await fetchResource("/for/moodboard/opengraph-image");
    assert(
      moodboardOgImageResponse.ok,
      `Moodboard campaign OpenGraph image returned ${moodboardOgImageResponse.status}`,
    );
    assert(
      moodboardOgImageResponse.headers.get("content-type")?.includes("image/png"),
      `Moodboard campaign OpenGraph image should be image/png, got ${moodboardOgImageResponse.headers.get("content-type")}`,
    );
    await moodboardOgImageResponse.body?.cancel();

    const moodboardSampleRoomResult = await request(`/api/rooms/${moodboardDemoRoomId}`);
    assert(
      moodboardSampleRoomResult.response.ok,
      `Moodboard sample room returned ${moodboardSampleRoomResult.response.status}`,
    );
    assert(
      moodboardSampleRoomResult.body?.room?.name === "Moodboard Decision",
      `Moodboard sample room name drifted: ${moodboardSampleRoomResult.body?.room?.name}`,
    );
    assert(
      moodboardSampleRoomResult.body.items.some((item) => item.id === "note-direction"),
      "Moodboard sample room should include the moodboard direction note",
    );
    const moodboardSampleRoomPageResult = await request(`/rooms/${moodboardDemoRoomId}`);
    assert(
      moodboardSampleRoomPageResult.response.ok,
      `Moodboard sample room page returned ${moodboardSampleRoomPageResult.response.status}`,
    );
    assertTextIncludes(moodboardSampleRoomPageResult.body, "noindex", "Moodboard sample room page");

    const moodboardSampleSnapshotResult = await request(`/rooms/${moodboardDemoRoomId}/snapshot`);
    assert(
      moodboardSampleSnapshotResult.response.ok,
      `Moodboard sample snapshot returned ${moodboardSampleSnapshotResult.response.status}`,
    );
    assertTextIncludes(moodboardSampleSnapshotResult.body, "noindex", "Moodboard sample snapshot");
    assertTextExcludes(
      moodboardSampleSnapshotResult.body,
      "Moodboard Decision",
      "Moodboard sample snapshot hides the room name until the owner publishes it",
    );

    const blankLandingResult = await request("/for/blank-room");
    assert(blankLandingResult.response.ok, `/for/blank-room returned ${blankLandingResult.response.status}`);
    assertTextIncludes(blankLandingResult.body, "Start a private visual decision room", "/for/blank-room metadata");
    assertTextIncludes(
      blankLandingResult.body,
      "Open a private visual decision room for prepared screenshots",
      "/for/blank-room metadata",
    );
    assertTextIncludes(blankLandingResult.body, "Start blank room", "/for/blank-room");
    assertTextIncludes(blankLandingResult.body, "Visual Decision Room", "/for/blank-room");
    assertTextIncludes(blankLandingResult.body, "/for/blank-room/opengraph-image", "/for/blank-room metadata");
    assertTextExcludes(blankLandingResult.body, "Choose a room starter", "/for/blank-room");
    assertTextExcludes(blankLandingResult.body, "Opens with", "/for/blank-room");
    assertTextExcludes(blankLandingResult.body, "creative feedback", "/for/blank-room");
    assertTextExcludes(blankLandingResult.body, "visual feedback", "/for/blank-room");
    const blankOgImageResponse = await fetchResource("/for/blank-room/opengraph-image");
    assert(blankOgImageResponse.ok, `Blank campaign OpenGraph image returned ${blankOgImageResponse.status}`);
    assert(
      blankOgImageResponse.headers.get("content-type")?.includes("image/png"),
      `Blank campaign OpenGraph image should be image/png, got ${blankOgImageResponse.headers.get("content-type")}`,
    );
    await blankOgImageResponse.body?.cancel();

    const visualDecisionSampleRoomResult = await request(`/api/rooms/${visualDecisionDemoRoomId}`);
    assert(
      visualDecisionSampleRoomResult.response.ok,
      `Visual decision sample room returned ${visualDecisionSampleRoomResult.response.status}`,
    );
    assert(
      visualDecisionSampleRoomResult.body?.room?.name === "Visual Decision Room",
      `Visual decision sample room name drifted: ${visualDecisionSampleRoomResult.body?.room?.name}`,
    );
    assert(
      visualDecisionSampleRoomResult.body.items.some((item) => item.id === "note-decision"),
      "Visual decision sample room should include the generic decision note",
    );
    const visualDecisionSampleRoomPageResult = await request(`/rooms/${visualDecisionDemoRoomId}`);
    assert(
      visualDecisionSampleRoomPageResult.response.ok,
      `Visual decision sample room page returned ${visualDecisionSampleRoomPageResult.response.status}`,
    );
    assertTextIncludes(visualDecisionSampleRoomPageResult.body, "noindex", "Visual decision sample room page");

    await assertStatus("/for/not-a-real-starter", 404);
    await assertStatus("/for/not-a-real-starter/opengraph-image", 404);

    const privacyResult = await request("/privacy");
    assert(privacyResult.response.ok, `/privacy returned ${privacyResult.response.status}`);
    assertTextIncludes(privacyResult.body, "rooms are private by default", "Privacy page");
    assertTextIncludes(privacyResult.body, supportEmail, "Privacy page support contact");
    assertTextIncludes(privacyResult.body, "subject=Roomboard%20support", "Privacy page support link");
    assertTextIncludes(privacyResult.body, "does not require an account or payment", "Privacy page");
    assertTextIncludes(privacyResult.body, "return to rooms without an account", "Privacy page token return copy");
    assertTextIncludes(
      privacyResult.body,
      "owner backup link carries creator access",
      "Privacy page owner backup copy",
    );
    assertTextIncludes(privacyResult.body, "private access key", "Privacy page owner backup warning");
    assertTextIncludes(privacyResult.body, "Delete permanently", "Privacy page data deletion");
    assertTextIncludes(privacyResult.body, "Permanent deletion cannot be undone", "Privacy page data deletion");
    assertTextIncludes(privacyResult.body, "display-name setup", "Privacy page analytics");
    assertTextIncludes(
      privacyResult.body,
      "uploads, comments, status changes, connector creation",
      "Privacy page analytics",
    );
    assertTextIncludes(
      privacyResult.body,
      "avoid room names, room IDs, invite tokens, owner tokens, filenames, image URLs, display names, messages, and card content",
      "Privacy page analytics",
    );
    assertTextExcludes(privacyResult.body, "source repository", "Privacy page");
    assertTextExcludes(privacyResult.body, "experimental auth", "Privacy page");

    const billingSuccessResult = await request("/billing/success?demo=1");
    assert(
      billingSuccessResult.response.ok,
      `/billing/success?demo=1 returned ${billingSuccessResult.response.status}`,
    );
    assertTextIncludes(billingSuccessResult.body, "noindex", "Billing status page");
    assertTextIncludes(billingSuccessResult.body, "Billing is not active here", "Billing status page");
    assertTextExcludes(billingSuccessResult.body, "Stripe demo mode", "Billing status page");

    await assertStatus("/api/room", 410);
    await assertStatus("/api/presence", 410);
    await assertStatus("/api/presence", 410, {
      body: JSON.stringify({}),
      method: "POST",
    });
    await assertStatus("/api/presence?id=readiness", 410, { method: "DELETE" });

    const dashboardResult = await request("/rooms");
    assert(dashboardResult.response.ok, `/rooms dashboard returned ${dashboardResult.response.status}`);
    assert(
      typeof dashboardResult.body === "string" && dashboardResult.body.includes("noindex"),
      "/rooms dashboard should render with noindex metadata",
    );
    assert(
      typeof dashboardResult.body === "string" &&
        dashboardResult.body.includes("Rooms console") &&
        dashboardResult.body.includes("Your private decision rooms.") &&
        dashboardResult.body.includes("next visual decision") &&
        !dashboardResult.body.includes("Built for visual thinkers"),
      "/rooms should render the work console, not a marketing feature grid",
    );
    assertTextExcludes(dashboardResult.body, "Your private review rooms.", "/rooms dashboard positioning");
    assertTextExcludes(dashboardResult.body, "next review", "/rooms dashboard positioning");
    assertTextIncludes(dashboardResult.body, "Visual decision", "/rooms dashboard default starter");
    assertTextIncludes(dashboardResult.body, "Clean room + first decision guide", "/rooms dashboard default starter");
    assertTextExcludes(dashboardResult.body, "Design review", "/rooms dashboard default starter");
    assertTextExcludes(dashboardResult.body, "Moodboard pass", "/rooms dashboard default starter");
    assertTextIncludes(
      dashboardResult.body,
      "remembers owner access in this browser",
      "/rooms dashboard owner-access copy",
    );
    assertTextIncludes(dashboardResult.body, "Private and locked by default", "/rooms dashboard private-room copy");
    assertTextIncludes(dashboardResult.body, "Open an invite", "/rooms dashboard invite recovery");
    assertTextIncludes(dashboardResult.body, `mailto:${supportEmail}`, "/rooms dashboard support link");
    assertTextIncludes(dashboardResult.body, "subject=Roomboard%20support", "/rooms dashboard support link");
    assertTextIncludes(dashboardResult.body, "Privacy", "/rooms dashboard privacy link");

    await assertStarterCreateContract("visual-decision", {
      connectionCount: 3,
      forbiddenTexts: ["Mockup A", "Mockup B", "Unsplash"],
      itemCount: 5,
      itemIds: ["note-question", "note-material", "note-feedback", "note-criteria", "note-decision"],
    });
    await assertStarterCreateContract("landing-review", {
      connectionCount: 5,
      forbiddenTexts: ["employer demo", "fake case-study"],
      itemCount: 6,
      itemIds: ["note-decision-question", "note-visual-material", "note-decision-record"],
    });
    await assertStarterCreateContract("moodboard", {
      connectionCount: 3,
      itemCount: 5,
      itemIds: ["note-direction", "note-criteria", "image-reference-a"],
    });

    const publicRoomsResult = await request("/api/rooms");
    assert(publicRoomsResult.response.ok, `Public rooms returned ${publicRoomsResult.response.status}`);
    const publicRooms = publicRoomsResult.body?.rooms;
    assert(Array.isArray(publicRooms), "Public rooms response did not include rooms array");
    const unexpectedPublicRooms = publicRooms.filter((room) => !demoRoomIds.has(room.id));
    assert(
      unexpectedPublicRooms.length === 0,
      `Unexpected public rooms without credentials: ${unexpectedPublicRooms.map((room) => room.id).join(", ")}`,
    );

    if (existingRoomId && existingOwnerToken) {
      createdRoomId = existingRoomId;
      ownerToken = existingOwnerToken;
      warnings.push("using READINESS_ROOM_ID/READINESS_OWNER_TOKEN; create-rate and cleanup checks skipped.");
    } else {
      const createResult = await request("/api/rooms", {
        body: JSON.stringify({
          access: "link",
          name: `Readiness audit ${Date.now()}`,
          visibility: "public",
        }),
        method: "POST",
      });
      assert(createResult.response.ok, `Room create returned ${createResult.response.status}`);
      const created = createResult.body;
      createdRoomId = created?.room?.id;
      ownerToken = created?.ownerToken;
      shouldCleanup = true;
      assert(createdRoomId && ownerToken, `Create response missing room/ownerToken: ${JSON.stringify(created)}`);
      assert(created.room.access === "locked", `Expected locked room, got ${created.room.access}`);
      assert(created.room.visibility === "private", `Expected private room, got ${created.room.visibility}`);

      const publicRoomsAfterCreate = await request("/api/rooms");
      assert(
        !publicRoomsAfterCreate.body?.rooms?.some((room) => room.id === createdRoomId),
        "New private room appeared in public room list",
      );
    }

    const bareSnapshot = await request(`/api/rooms/${createdRoomId}`);
    assert(bareSnapshot.response.status === 403, `Bare room snapshot returned ${bareSnapshot.response.status}`);

    const ownerSnapshot = await request(`/api/rooms/${createdRoomId}`, {
      headers: { "X-Room-Owner-Token": ownerToken },
    });
    const ownerQuerySnapshot = await request(
      `/api/rooms/${createdRoomId}?ownerToken=${encodeURIComponent(ownerToken)}`,
    );
    assert(ownerSnapshot.response.ok, `Owner room snapshot returned ${ownerSnapshot.response.status}`);
    assert(ownerSnapshot.body?.permissions?.role === "owner", "Owner snapshot did not include owner role");
    assert(ownerQuerySnapshot.body?.permissions?.role === "owner", "Owner query snapshot did not include owner role");
    assert(ownerSnapshot.body?.permissions?.canManage === true, "Owner snapshot did not include canManage=true");
    assert(ownerSnapshot.body?.inviteTokens?.editor, "Owner snapshot missing editor invite token");
    assert(ownerSnapshot.body?.inviteTokens?.viewer, "Owner snapshot missing viewer invite token");
    if (strict) {
      assert(ownerSnapshot.body?.realtimeToken, "Strict mode requires room snapshot realtimeToken");
    }

    const viewerToken = ownerSnapshot.body.inviteTokens.viewer;
    const guestUpload = await request("/api/uploads", {
      body: uploadForm(createdRoomId),
      method: "POST",
    });
    const viewerUpload = await request("/api/uploads", {
      body: uploadForm(createdRoomId, "inviteToken", viewerToken),
      method: "POST",
    });
    assert(guestUpload.response.status === 403, `Guest upload returned ${guestUpload.response.status}`);
    assert(viewerUpload.response.status === 403, `Viewer upload returned ${viewerUpload.response.status}`);

    await assertStatus(`/api/rooms/${createdRoomId}/presence`, 403);
    await assertStatus(`/api/rooms/${createdRoomId}/presence?id=readiness`, 403, { method: "DELETE" });
    await assertStatus(`/api/rooms/${createdRoomId}/recap`, 403);
    await assertStatus(`/api/rooms/${createdRoomId}/recap?format=markdown`, 403);

    const publicVisibilityAttempt = await request(`/api/rooms/${createdRoomId}`, {
      body: JSON.stringify({ action: "visibility", visibility: "public" }),
      headers: { "X-Room-Owner-Token": ownerToken },
      method: "PATCH",
    });
    assert(
      publicVisibilityAttempt.response.status === 400,
      `Public visibility attempt returned ${publicVisibilityAttempt.response.status}`,
    );

    const bareDelete = await request(`/api/rooms/${createdRoomId}`, { method: "DELETE" });
    assert(bareDelete.response.status === 403, `Bare room delete returned ${bareDelete.response.status}`);
  } finally {
    if (shouldCleanup && createdRoomId && ownerToken) {
      const cleanup = await request(`/api/rooms/${createdRoomId}?permanent=true`, {
        headers: { "X-Room-Owner-Token": ownerToken },
        method: "DELETE",
      });
      assert(cleanup.response.ok, `Cleanup returned ${cleanup.response.status}`);
    }
  }

  for (const warning of warnings) {
    console.warn(`Readiness warning: ${warning}`);
  }
  console.log(`Readiness passed for ${baseUrl}${strict ? " in strict mode" : ""}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
