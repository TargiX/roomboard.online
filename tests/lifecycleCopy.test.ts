import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getLifecycleCopy, getProfileJoinCopy } from "../lib/lifecycleCopy.ts";
import type { RoomAccess, RoomPermissions } from "../lib/canvasRoom.ts";

function permissions(role: RoomPermissions["role"]): RoomPermissions {
  return { role } as RoomPermissions;
}

const ACCESS_MODES: RoomAccess[] = ["locked", "link"];

describe("Profile join copy", () => {
  it("tells owners their browser keeps creator access", () => {
    const copy = getProfileJoinCopy(permissions("owner"));

    assert.equal(copy.action, "Enter room");
    assert.equal(copy.title, "Choose your display name");
    assert.match(copy.body, /this browser keeps creator access/);
    assert.match(copy.body, /No account is needed/);
  });

  it("frames viewer invites as read-only", () => {
    const copy = getProfileJoinCopy(permissions("viewer"));

    assert.equal(copy.action, "Enter as viewer");
    assert.equal(copy.title, "Enter as viewer");
    assert.match(copy.body, /read-only invite/);
  });

  it("frames editor invites as contributing access", () => {
    const copy = getProfileJoinCopy(permissions("editor"));

    assert.equal(copy.action, "Enter as editor");
    assert.equal(copy.title, "Enter as editor");
    assert.match(copy.body, /editor invite lets you add cards/);
  });
});

describe("Lifecycle copy contract", () => {
  it("covers every role and access mode without fallback copy", () => {
    const roles: RoomPermissions["role"][] = ["owner", "editor", "viewer"];

    for (const access of ACCESS_MODES) {
      for (const role of roles) {
        const copy = getLifecycleCopy(permissions(role), access, "Ada", true);

        for (const [field, value] of Object.entries(copy)) {
          assert.ok(value.length > 0, `${access}/${role} left ${field} empty`);
        }

        // Every mode pair must resolve to bespoke copy, never the generic guest default.
        assert.notEqual(copy.emptyStateTitle, "guest, this room is empty");
      }
    }
  });

  it("locks copy to invite-only expectations per role", () => {
    const owner = getLifecycleCopy(permissions("owner"), "locked", "Ada", true);
    const editor = getLifecycleCopy(permissions("editor"), "locked", "Ada", true);
    const viewer = getLifecycleCopy(permissions("viewer"), "locked", "Ada", true);

    assert.equal(owner.accessBadge, "Locked · invite only");
    assert.match(owner.accessBanner, /Room is invite-only/);
    assert.equal(owner.emptyStateAction, "Copy editor link");

    assert.equal(editor.accessBadge, "Locked · editor");
    assert.match(editor.accessBanner, /editor link and can still edit/);
    assert.equal(editor.emptyStateAction, "Add the first card");

    assert.equal(viewer.accessBadge, "Locked · viewer");
    assert.match(viewer.accessBanner, /viewer link and can read/);
    assert.equal(viewer.emptyStateAction, "Open rooms console");
  });

  it("marks open rooms as link access and points owners at the Lock control", () => {
    const owner = getLifecycleCopy(permissions("owner"), "link", "Ada", true);
    const editor = getLifecycleCopy(permissions("editor"), "link", "Ada", true);
    const viewer = getLifecycleCopy(permissions("viewer"), "link", "Ada", true);

    assert.equal(owner.accessBadge, "Open · link access");
    assert.match(owner.accessBanner, /Use Lock in the header/);
    assert.equal(owner.emptyStateAction, "Add the first card");

    assert.equal(editor.accessBadge, "Open · editor");
    assert.equal(editor.emptyStateAction, "Add the first card");

    assert.equal(viewer.accessBadge, "Open · viewer");
    assert.match(viewer.accessBanner, /read-only guest/);
    assert.equal(viewer.emptyStateAction, "Open rooms console");
  });

  it("keeps the owner backup promise in locked-room owner copy", () => {
    const owner = getLifecycleCopy(permissions("owner"), "locked", "Ada", true);

    // Owner copy must always offer a way to share access, never dead-end.
    assert.match(owner.emptyStateBody, /share an editor link/);
  });

  it("falls back to guest for blank or whitespace display names", () => {
    const blank = getLifecycleCopy(permissions("viewer"), "link", "", true);
    const whitespace = getLifecycleCopy(permissions("viewer"), "link", "   ", true);

    assert.equal(blank.emptyStateTitle, "guest, this room is empty");
    assert.equal(whitespace.emptyStateTitle, "guest, this room is empty");
  });

  it("uses the trimmed display name in titles", () => {
    const copy = getLifecycleCopy(permissions("editor"), "link", "  Ada  ", true);

    assert.equal(copy.emptyStateTitle, "Hi Ada, ready to start");
  });
});
