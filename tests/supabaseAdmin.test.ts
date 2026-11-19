import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { getSupabaseAdminClient, getSupabaseUserFromRequest } from "../lib/supabaseAdmin.ts";

// supabaseAdmin caches its client on `globalThis.roomboardAdminClient` before
// any env access, so a fake injected there takes over both `getUser` routing
// and memoization without importing a mockable supabase module.
const clientSlot = globalThis as unknown as { roomboardAdminClient?: unknown };

type GetUserResult = {
  data: { user: { email?: string | null; id: string } | null };
  error: unknown;
};

type FakeAdminClient = {
  auth: { getUser: (token: string) => Promise<GetUserResult> };
  getUserCalls: string[];
};

const ENV_KEYS = ["SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const;
const savedEnv: Record<string, string | undefined> = {};
let savedClient: unknown;

function clearSupabaseEnv() {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
}

function saveGlobals() {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
  }
  savedClient = clientSlot.roomboardAdminClient;
}

function restoreGlobals() {
  for (const key of ENV_KEYS) {
    const value = savedEnv[key];
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  if (savedClient === undefined) {
    delete clientSlot.roomboardAdminClient;
  } else {
    clientSlot.roomboardAdminClient = savedClient;
  }
}

function configureEnv() {
  process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.example.test";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-test";
}

function injectFakeClient(getUser?: (token: string) => Promise<GetUserResult>): FakeAdminClient {
  const fake: FakeAdminClient = {
    getUserCalls: [],
    auth: {
      getUser: async (token: string) => {
        fake.getUserCalls.push(token);
        return getUser
          ? await getUser(token)
          : { data: { user: { email: "founder@example.test", id: "user-1" } }, error: null };
      },
    },
  };
  clientSlot.roomboardAdminClient = fake;
  return fake;
}

function bearerRequest(token: string): Request {
  return new Request("https://roomboard.example.test/api/billing/checkout", {
    headers: { authorization: `Bearer ${token}` },
  });
}

describe("getSupabaseAdminClient", () => {
  it("returns null when no Supabase URL is configured", () => {
    saveGlobals();
    clearSupabaseEnv();
    delete clientSlot.roomboardAdminClient;
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key-test";

    assert.equal(getSupabaseAdminClient(), null);
  });

  it("returns null when the service role key is missing", () => {
    saveGlobals();
    clearSupabaseEnv();
    delete clientSlot.roomboardAdminClient;
    process.env.SUPABASE_URL = "https://supabase.example.test";

    assert.equal(getSupabaseAdminClient(), null);
  });

  it("memoizes a single client instance across calls", () => {
    saveGlobals();
    clearSupabaseEnv();
    delete clientSlot.roomboardAdminClient;
    configureEnv();

    const first = getSupabaseAdminClient();
    const second = getSupabaseAdminClient();

    assert.ok(first);
    assert.equal(second, first);
  });
});

describe("getSupabaseUserFromRequest", () => {
  it("returns null when the admin client is unconfigured, even with a bearer token", async () => {
    saveGlobals();
    clearSupabaseEnv();
    delete clientSlot.roomboardAdminClient;

    const user = await getSupabaseUserFromRequest(bearerRequest("token-1"));

    assert.equal(user, null);
  });

  it("returns the verified user id and email for a valid bearer token", async () => {
    saveGlobals();
    configureEnv();
    const fake = injectFakeClient();

    const user = await getSupabaseUserFromRequest(bearerRequest("token-abc"));

    assert.deepEqual(user, { email: "founder@example.test", id: "user-1" });
    assert.deepEqual(fake.getUserCalls, ["token-abc"]);
  });

  it("returns email undefined when the verified user has no email", async () => {
    saveGlobals();
    configureEnv();
    injectFakeClient(() => Promise.resolve({ data: { user: { id: "user-2" } }, error: null }));

    const user = await getSupabaseUserFromRequest(bearerRequest("token-2"));

    assert.deepEqual(user, { email: undefined, id: "user-2" });
  });

  it("returns null when the authorization header is missing", async () => {
    saveGlobals();
    configureEnv();
    const fake = injectFakeClient();

    const user = await getSupabaseUserFromRequest(new Request("https://roomboard.example.test/api/billing/checkout"));

    assert.equal(user, null);
    assert.deepEqual(fake.getUserCalls, []);
  });

  it("returns null for a non-bearer authorization scheme", async () => {
    saveGlobals();
    configureEnv();
    const fake = injectFakeClient();

    const request = new Request("https://roomboard.example.test/api/billing/checkout", {
      headers: { authorization: "Basic dXNlcjpwYXNz" },
    });

    const user = await getSupabaseUserFromRequest(request);

    assert.equal(user, null);
    assert.deepEqual(fake.getUserCalls, []);
  });

  it("returns null when the bearer token is empty", async () => {
    saveGlobals();
    configureEnv();
    const fake = injectFakeClient();

    const user = await getSupabaseUserFromRequest(bearerRequest("   "));

    assert.equal(user, null);
    assert.deepEqual(fake.getUserCalls, []);
  });

  it("returns null when Supabase rejects the token with an error", async () => {
    saveGlobals();
    configureEnv();
    injectFakeClient(() => Promise.resolve({ data: { user: null }, error: { message: "Invalid token" } }));

    const user = await getSupabaseUserFromRequest(bearerRequest("token-stale"));

    assert.equal(user, null);
  });

  it("returns null when Supabase resolves no user", async () => {
    saveGlobals();
    configureEnv();
    injectFakeClient(() => Promise.resolve({ data: { user: null }, error: null }));

    const user = await getSupabaseUserFromRequest(bearerRequest("token-ghost"));

    assert.equal(user, null);
  });

  it("returns null when the Supabase call itself throws", async () => {
    saveGlobals();
    configureEnv();
    injectFakeClient(() => Promise.reject(new Error("network down")));

    const user = await getSupabaseUserFromRequest(bearerRequest("token-net"));

    assert.equal(user, null);
  });

  it("never derives the user from the request body", async () => {
    saveGlobals();
    configureEnv();
    injectFakeClient();

    const request = new Request("https://roomboard.example.test/api/billing/checkout", {
      body: JSON.stringify({ customerId: "cus_attacker", userId: "user-attacker" }),
      headers: { authorization: "Bearer token-body-attack", "content-type": "application/json" },
      method: "POST",
    });

    const user = await getSupabaseUserFromRequest(request);

    assert.notEqual(user, null);
    assert.equal((user as { id: string }).id, "user-1");
  });
});

afterEach(() => {
  restoreGlobals();
});
