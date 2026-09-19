import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildRoomPathWithHashToken,
  isAuthorizedRoomInviteToken,
  normalizeRoomRouteFromInput,
  persistAuthorizedRoomInviteToken,
  readRoomTokenFromUrl,
  resolveRoomInviteToken,
  setRoomHashToken,
  stripRoomTokensFromUrl,
} from "../lib/roomLinks.ts";

describe("room link helpers", () => {
  it("builds new room paths with sensitive tokens in the hash fragment", () => {
    assert.equal(
      buildRoomPathWithHashToken("private-room", "ownerToken", "secret owner", {
        new: "1",
        starter: "landing-review",
      }),
      "/rooms/private-room?new=1&starter=landing-review#ownerToken=secret+owner",
    );
  });

  it("reads hash tokens before legacy query tokens", () => {
    const url = new URL("https://roomboard.test/rooms/a?ownerToken=query-token#ownerToken=hash-token");

    assert.equal(readRoomTokenFromUrl(url, ["ownerToken"]), "hash-token");
  });

  it("keeps legacy query token links readable", () => {
    const url = new URL("https://roomboard.test/rooms/a?invite=legacy-invite");

    assert.equal(readRoomTokenFromUrl(url, ["invite", "inviteToken"]), "legacy-invite");
  });

  it("keeps a remembered invite available when a URL invite is not authorized", () => {
    const url = new URL("https://roomboard.test/rooms/a#invite=invalid-url-token");
    const rememberedTokens = { a: "remembered-valid-token" };
    const invite = resolveRoomInviteToken(url, "a", rememberedTokens);

    assert.deepEqual(invite, { token: "invalid-url-token", tokenFromUrl: "invalid-url-token" });
    assert.equal(isAuthorizedRoomInviteToken(invite.tokenFromUrl, "owner"), false);
    assert.equal(persistAuthorizedRoomInviteToken(url, "a", invite.tokenFromUrl, "owner", rememberedTokens), null);
    assert.deepEqual(rememberedTokens, { a: "remembered-valid-token" });
    assert.equal(url.toString(), "https://roomboard.test/rooms/a#invite=invalid-url-token");
  });

  it("authorizes a URL invite only for an invite snapshot role", () => {
    const url = new URL("https://roomboard.test/rooms/a?new=1#invite=authorized-url-token");
    const invite = resolveRoomInviteToken(url, "a", { a: "remembered-token" });

    assert.deepEqual(invite, { token: "authorized-url-token", tokenFromUrl: "authorized-url-token" });
    assert.equal(isAuthorizedRoomInviteToken(invite.tokenFromUrl, "editor"), true);
    assert.deepEqual(
      persistAuthorizedRoomInviteToken(url, "a", invite.tokenFromUrl, "editor", { a: "remembered-token" }),
      { a: "authorized-url-token" },
    );
    assert.equal(url.toString(), "https://roomboard.test/rooms/a?new=1");
  });

  it("strips credential params without removing unrelated routing params", () => {
    const url = new URL("https://roomboard.test/rooms/a?new=1&ownerToken=query-token#invite=hash-token&panel=open");

    stripRoomTokensFromUrl(url, ["ownerToken", "invite"]);

    assert.equal(url.toString(), "https://roomboard.test/rooms/a?new=1#panel=open");
  });

  it("sets invite tokens into an existing hash fragment", () => {
    const url = new URL("https://roomboard.test/rooms/a?new=1#panel=open");

    setRoomHashToken(url, "invite", "editor-token");

    assert.equal(url.toString(), "https://roomboard.test/rooms/a?new=1#panel=open&invite=editor-token");
  });

  it("normalizes pasted invite links without dropping token fragments", () => {
    assert.equal(
      normalizeRoomRouteFromInput("https://roomboard.online/rooms/private-room-1#invite=editor-token"),
      "/rooms/private-room-1#invite=editor-token",
    );
  });

  it("normalizes plain room ids for manual entry", () => {
    assert.equal(normalizeRoomRouteFromInput("private-room-1"), "/rooms/private-room-1");
  });

  it("rejects unrelated paths", () => {
    assert.equal(normalizeRoomRouteFromInput("https://roomboard.online/privacy"), "");
  });
});
