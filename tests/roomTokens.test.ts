import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  createLocalId,
  getInviteToken,
  getOwnerToken,
  inviteTokensKey,
  ownerTokensKey,
  persistAuthorizedInviteToken,
  readInviteTokens,
  readOwnerTokens,
  readStoredTokenMap,
  storeRoomAccessToken,
  writeOwnerToken,
  writeStoredTokenMap,
} from "../lib/roomTokens.ts";

type StorageMock = {
  data: Map<string, string>;
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
};

function createStorageMock({ failWrites = false } = {}): StorageMock {
  const data = new Map<string, string>();

  return {
    data,
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      if (failWrites) {
        throw new Error("QuotaExceededError");
      }
      data.set(key, value);
    },
  };
}

type WindowMock = {
  localStorage: StorageMock;
  location: { href: string };
  history: { replaceState: (...args: unknown[]) => void; calls: unknown[][] };
};

let previousWindowDescriptor: PropertyDescriptor | undefined;
let previousLocalStorageDescriptor: PropertyDescriptor | undefined;

function withMockWindow(
  url: string,
  options?: { failWrites?: boolean },
): WindowMock {
  previousWindowDescriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  previousLocalStorageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
  const localStorage = createStorageMock(options);
  const windowMock: WindowMock = {
    localStorage,
    location: { href: url },
    history: {
      calls: [],
      replaceState(...args: unknown[]) {
        windowMock.history.calls.push(args);
      },
    },
  };

  Object.defineProperty(globalThis, "window", { configurable: true, value: windowMock });
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: localStorage });

  return windowMock;
}

function restoreBrowserGlobals() {
  if (previousWindowDescriptor) {
    Object.defineProperty(globalThis, "window", previousWindowDescriptor);
    previousWindowDescriptor = undefined;
  } else {
    delete (globalThis as { window?: unknown }).window;
  }

  if (previousLocalStorageDescriptor) {
    Object.defineProperty(globalThis, "localStorage", previousLocalStorageDescriptor);
    previousLocalStorageDescriptor = undefined;
  } else {
    delete (globalThis as { localStorage?: unknown }).localStorage;
  }
}

afterEach(() => {
  restoreBrowserGlobals();
});

describe("room token storage", () => {
  it("reads an empty map when there is no browser window", () => {
    assert.deepEqual(readStoredTokenMap(ownerTokensKey), {});
    assert.deepEqual(readOwnerTokens(), {});
    assert.deepEqual(readInviteTokens(), {});
  });

  it("tolerates corrupted stored JSON instead of throwing", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a");
    browser.localStorage.setItem(ownerTokensKey, "{not-json");

    assert.deepEqual(readOwnerTokens(), {});
  });

  it("writes and reads token maps without clobbering other rooms", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a");

    assert.equal(storeRoomAccessToken(inviteTokensKey, "room-a", "invite-a"), true);
    assert.equal(storeRoomAccessToken(inviteTokensKey, "room-b", "invite-b"), true);

    assert.deepEqual(readInviteTokens(), { "room-a": "invite-a", "room-b": "invite-b" });
    assert.equal(browser.localStorage.getItem(inviteTokensKey), JSON.stringify({ "room-a": "invite-a", "room-b": "invite-b" }));
  });

  it("reports failure when the storage write throws", () => {
    withMockWindow("https://roomboard.test/rooms/a", { failWrites: true });

    assert.equal(writeStoredTokenMap(ownerTokensKey, { a: "token" }), false);
  });

  it("writeOwnerToken returns the merged map even when persistence fails", () => {
    withMockWindow("https://roomboard.test/rooms/a", { failWrites: true });

    const tokens = writeOwnerToken("room-a", "owner-a");
    assert.deepEqual(tokens, { "room-a": "owner-a" });
    assert.deepEqual(readOwnerTokens(), {});
  });

  it("writeOwnerToken merges into the existing owner token map", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/b");

    writeOwnerToken("room-a", "owner-a");
    writeOwnerToken("room-b", "owner-b");

    assert.deepEqual(readOwnerTokens(), { "room-a": "owner-a", "room-b": "owner-b" });
    assert.equal(browser.localStorage.getItem(ownerTokensKey), JSON.stringify({ "room-a": "owner-a", "room-b": "owner-b" }));
  });
});

describe("getOwnerToken", () => {
  it("returns an empty token without a browser window", () => {
    assert.equal(getOwnerToken("room-a"), "");
  });

  it("prefers the URL token, persists it, and strips it from the URL", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a?new=1#ownerToken=url-owner");

    assert.equal(getOwnerToken("room-a"), "url-owner");
    assert.deepEqual(readOwnerTokens(), { "room-a": "url-owner" });

    assert.equal(browser.history.calls.length, 1);
    const rewritten = browser.history.calls[0][2] as string;
    assert.equal(rewritten, "/rooms/a?new=1");
    assert.ok(!rewritten.includes("ownerToken"));
  });

  it("keeps the token in the URL when persisting it fails", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a#ownerToken=url-owner", { failWrites: true });

    assert.equal(getOwnerToken("room-a"), "url-owner");
    assert.equal(browser.history.calls.length, 0);
  });

  it("falls back to the stored token when the URL has none", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a");
    browser.localStorage.setItem(ownerTokensKey, JSON.stringify({ "room-a": "stored-owner" }));

    assert.equal(getOwnerToken("room-a"), "stored-owner");
    assert.equal(browser.history.calls.length, 0);
  });

  it("returns an empty token for unknown rooms without stored tokens", () => {
    withMockWindow("https://roomboard.test/rooms/unknown");

    assert.equal(getOwnerToken("room-unknown"), "");
  });
});

describe("getInviteToken", () => {
  it("returns empty results without a browser window", () => {
    assert.deepEqual(getInviteToken("room-a"), { token: "", tokenFromUrl: "" });
  });

  it("prefers the URL invite token over the remembered one", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a#invite=url-invite");
    browser.localStorage.setItem(inviteTokensKey, JSON.stringify({ "room-a": "remembered-invite" }));

    assert.deepEqual(getInviteToken("room-a"), { token: "url-invite", tokenFromUrl: "url-invite" });
  });

  it("keeps a remembered invite available when the URL has none", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a");
    browser.localStorage.setItem(inviteTokensKey, JSON.stringify({ "room-a": "remembered-invite" }));

    assert.deepEqual(getInviteToken("room-a"), { token: "remembered-invite", tokenFromUrl: "" });
  });
});

describe("persistAuthorizedInviteToken", () => {
  it("persists an editor-authorized invite, strips the URL token, and rewrites history", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a?new=1#invite=url-invite");

    const persisted = persistAuthorizedInviteToken("room-a", "confirmed-invite", {
      permissions: { role: "editor" },
    } as never);

    assert.equal(persisted, true);
    assert.deepEqual(readInviteTokens(), { "room-a": "confirmed-invite" });

    assert.equal(browser.history.calls.length, 1);
    const rewritten = browser.history.calls[0][2] as string;
    assert.equal(rewritten, "/rooms/a?new=1");
    assert.ok(!rewritten.includes("invite"));
  });

  it("rejects tokens the server did not authorize", () => {
    const browser = withMockWindow("https://roomboard.test/rooms/a#invite=url-invite");

    assert.equal(
      persistAuthorizedInviteToken("room-a", "unconfirmed-invite", {
        permissions: { role: null },
      } as never),
      false,
    );
    assert.deepEqual(readInviteTokens(), {});
    assert.equal(browser.history.calls.length, 0);
  });

  it("refuses to persist when storage write fails", () => {
    withMockWindow("https://roomboard.test/rooms/a#invite=url-invite", { failWrites: true });

    assert.equal(
      persistAuthorizedInviteToken("room-a", "confirmed-invite", {
        permissions: { role: "viewer" },
      } as never),
      false,
    );
  });
});

describe("createLocalId", () => {
  it("produces non-empty ids without requiring a browser window", () => {
    const id = createLocalId();
    assert.ok(id.length > 0);
    assert.notEqual(id, createLocalId());
  });
});
