import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  assertRoomCapacity,
  beginRoomPermanentDeletion,
  buildRoomDecisionBrief,
  buildRoomRecap,
  canAccessRoom,
  canEditRoom,
  closeRoom,
  createRoom,
  createRoomItem,
  deleteRoomPermanently,
  duplicateRoomItem,
  getLifecycleCopy,
  getPublicRoomSnapshot,
  getProfileJoinCopy,
  getRoomSnapshot,
  isRoomItemStyleVariant,
  isRoomNotFoundError,
  listRooms,
  MOODBOARD_SAMPLE_ROOM_ID,
  roomItemStatuses,
  roomCapacityLimits,
  SAMPLE_ROOM_IDS,
  setRoomAccess,
  setRoomSnapshotPublic,
  toggleRoomItemDecisionSignal,
  updateRoomItem,
  VISUAL_DECISION_SAMPLE_ROOM_ID,
  type RoomActivity,
  type RoomNotFoundError,
  type RoomItem,
  type RoomPermissions,
  type RoomSnapshot,
} from "../lib/canvasRoom.ts";

const updatedAt = Date.UTC(2026, 4, 29, 12, 0, 0);

function makeItem(overrides: Partial<RoomItem> = {}): RoomItem {
  return {
    id: "item-1",
    type: "note",
    status: "open",
    title: "Open question",
    body: "What should we decide next?",
    author: "Ilya",
    color: "#facc5c",
    x: 0,
    y: 0,
    width: 240,
    height: 160,
    createdAt: updatedAt - 2000,
    updatedAt: updatedAt - 1000,
    comments: [],
    ...overrides,
  };
}

function makeActivity(overrides: Partial<RoomActivity> = {}): RoomActivity {
  return {
    id: "activity-1",
    actor: "Roomboard",
    createdAt: updatedAt,
    message: "Created a note.",
    type: "item_created",
    ...overrides,
  };
}

function makeSnapshot(
  items: RoomItem[],
  activities: RoomActivity[] = [],
): Pick<RoomSnapshot, "activities" | "connections" | "items" | "room"> {
  const statusCounts = Object.fromEntries(
    roomItemStatuses.map((status) => [status, 0]),
  ) as RoomSnapshot["room"]["statusCounts"];

  for (const item of items) {
    statusCounts[item.status] += 1;
  }

  return {
    activities,
    connections: [
      {
        id: "connection-1",
        from: "approved-note",
        to: "reference-image",
      },
    ],
    items,
    room: {
      id: "review-room",
      name: "Review Room",
      access: "link",
      visibility: "public",
      isSnapshotPublic: false,
      createdAt: updatedAt - 10000,
      updatedAt,
      itemCount: items.length,
      noteCount: items.filter((item) => item.type === "note").length,
      imageCount: items.filter((item) => item.type === "image").length,
      commentCount: items.reduce((total, item) => total + item.comments.length, 0),
      connectionCount: 1,
      activityCount: activities.length,
      liveCount: 0,
      statusCounts,
      participants: [],
      previewItems: [],
    },
  };
}

describe("room lifecycle permissions", () => {
  it("enforces documented room capacity boundaries before mutating a room", () => {
    assert.doesNotThrow(() => assertRoomCapacity("items", roomCapacityLimits.items - 1));
    assert.throws(
      () => assertRoomCapacity("items", roomCapacityLimits.items),
      (error: unknown) =>
        error instanceof Error && error.name === "RoomCapacityError" && /items limit/.test(error.message),
    );
    assert.throws(() => assertRoomCapacity("comments", roomCapacityLimits.comments - 1, 2), /comments limit/);
  });

  it("creates rooms as private and invite-only by default", async () => {
    const roomName = `Private room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    assert.equal(created.room.access, "locked");
    assert.equal(created.room.visibility, "private");
    assert.equal(created.room.itemCount, 0);
    assert.equal(await canAccessRoom(roomId), false);
    assert.equal(await canEditRoom(roomId), false);
    assert.equal(
      (await listRooms()).some((room) => room.id === roomId),
      false,
    );
    assert.equal(created.room.shareInvite?.role, "editor");

    const ownerListedRoom = (await listRooms({ ownerTokens: { [roomId]: created.ownerToken } })).find(
      (room) => room.id === roomId,
    );
    assert.ok(ownerListedRoom);
    assert.equal(ownerListedRoom.shareInvite?.role, "editor");

    const ownerSnapshot = await getRoomSnapshot(roomId, ownerCredentials);
    assert.ok(ownerSnapshot);
    assert.equal(ownerSnapshot.permissions.role, "owner");
    assert.ok(ownerSnapshot.inviteTokens?.editor);
    assert.equal(created.room.shareInvite?.token, ownerSnapshot.inviteTokens.editor);
    assert.equal(ownerListedRoom.shareInvite?.token, ownerSnapshot.inviteTokens.editor);
  });

  it("lets only the owner permanently delete a room", async () => {
    const created = await createRoom(`Delete me ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const roomId = created.room.id;

    assert.equal(await deleteRoomPermanently(roomId, { ownerToken: "wrong" }), false);
    assert.ok(await getRoomSnapshot(roomId, { ownerToken: created.ownerToken }));
    assert.equal(await deleteRoomPermanently(roomId, { ownerToken: created.ownerToken }), true);
    assert.equal(await getRoomSnapshot(roomId, { ownerToken: created.ownerToken }), null);
  });

  it("lets the owner permanently delete a closed room without making it visible again", async () => {
    const created = await createRoom(`Close then delete ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const credentials = { ownerToken: created.ownerToken };

    assert.ok(await closeRoom(created.room.id, credentials));
    assert.equal(await getRoomSnapshot(created.room.id, credentials), null);
    assert.equal(await deleteRoomPermanently(created.room.id, credentials), true);
    assert.equal(await deleteRoomPermanently(created.room.id, credentials), false);
  });

  it("makes a permanent deletion request durable and retryable before external cleanup", async () => {
    const created = await createRoom(`Retry deletion ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const credentials = { ownerToken: created.ownerToken };

    assert.equal(await beginRoomPermanentDeletion(created.room.id, credentials), true);
    assert.equal(await getRoomSnapshot(created.room.id, credentials), null);
    assert.equal(await beginRoomPermanentDeletion(created.room.id, credentials), true);
    assert.equal(await deleteRoomPermanently(created.room.id, credentials), true);
  });

  it("normalizes untrusted card geometry and colors before persistence", async () => {
    const created = await createRoom(`Bounded card ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const item = await createRoomItem(
      {
        author: "Tester",
        color: "not-a-color",
        height: -500,
        title: "Untrusted geometry",
        type: "note",
        width: 999999,
        x: Number.MAX_SAFE_INTEGER,
        y: Number.MIN_SAFE_INTEGER,
      },
      created.room.id,
    );

    assert.equal(item.color, "#48a7ff");
    assert.equal(item.height, 80);
    assert.equal(item.width, 1200);
    assert.equal(item.x, 100000);
    assert.equal(item.y, -100000);
    assert.equal(await deleteRoomPermanently(created.room.id, { ownerToken: created.ownerToken }), true);
  });

  it("creates a fresh private room for repeated starter names", async () => {
    const first = await createRoom("Landing page review", "private", "landing-review", "locked");
    const second = await createRoom("Landing page review", "private", "landing-review", "locked");

    assert.notEqual(first.room.id, second.room.id);
    assert.notEqual(first.ownerToken, second.ownerToken);
    assert.match(first.room.id, /^landing-page-review-/);
    assert.match(second.room.id, /^landing-page-review-/);
    assert.equal(first.room.visibility, "private");
    assert.equal(second.room.visibility, "private");
    assert.equal(first.room.itemCount, 6);
    assert.equal(second.room.itemCount, 6);
    assert.equal(
      (await listRooms()).some((room) => room.id === first.room.id || room.id === second.room.id),
      false,
    );
  });

  it("keeps sample rooms out of the active room list while direct previews work", async () => {
    const rooms = await listRooms();
    const sampleSnapshot = await getRoomSnapshot();
    const moodboardSampleSnapshot = await getRoomSnapshot(MOODBOARD_SAMPLE_ROOM_ID);
    const visualDecisionSampleSnapshot = await getRoomSnapshot(VISUAL_DECISION_SAMPLE_ROOM_ID);

    for (const sampleRoomId of SAMPLE_ROOM_IDS) {
      assert.equal(
        rooms.some((room) => room.id === sampleRoomId),
        false,
      );
    }
    assert.ok(sampleSnapshot);
    assert.equal(sampleSnapshot.permissions.role, "viewer");
    assert.equal(sampleSnapshot.room.name, "Launch Approval — Decision Complete");
    assert.equal(sampleSnapshot.room.itemCount, 6);
    assert.equal(sampleSnapshot.room.statusCounts.approved, sampleSnapshot.room.itemCount);
    assert.equal(
      sampleSnapshot.items.some((item) => item.id === "note-decision-record"),
      true,
    );
    assert.equal(
      sampleSnapshot.items.some((item) => item.body.includes("Ship the focused hero")),
      true,
    );
    assert.equal(
      sampleSnapshot.items.some((item) => item.comments.length > 0),
      true,
    );
    assert.equal(
      sampleSnapshot.items.some((item) => item.body.includes("employer demo")),
      false,
    );
    assert.ok(moodboardSampleSnapshot);
    assert.equal(moodboardSampleSnapshot.permissions.role, "viewer");
    assert.equal(moodboardSampleSnapshot.room.name, "Moodboard Decision");
    assert.equal(moodboardSampleSnapshot.room.itemCount, 5);
    assert.equal(
      moodboardSampleSnapshot.items.some((item) => item.id === "note-direction"),
      true,
    );
    assert.ok(visualDecisionSampleSnapshot);
    assert.equal(visualDecisionSampleSnapshot.permissions.role, "viewer");
    assert.equal(visualDecisionSampleSnapshot.room.name, "Visual Decision Room");
    assert.equal(visualDecisionSampleSnapshot.room.itemCount, 5);
    assert.equal(
      visualDecisionSampleSnapshot.items.some((item) => item.id === "note-decision"),
      true,
    );
    assert.equal(
      visualDecisionSampleSnapshot.items.some((item) => item.title === "Mockup A" || item.title === "Mockup B"),
      false,
    );
  });

  it("can create guided starter rooms without making them public", async () => {
    const starters = [
      {
        connectionCount: 5,
        expectedItemIds: ["note-decision-question", "note-visual-material", "note-decision-record"],
        itemCount: 6,
        template: "landing-review" as const,
      },
      {
        connectionCount: 3,
        expectedItemIds: ["note-direction", "image-reference-a"],
        itemCount: 5,
        template: "moodboard" as const,
      },
      {
        connectionCount: 3,
        expectedItemIds: ["note-question", "note-material", "note-feedback", "note-decision"],
        itemCount: 5,
        template: "visual-decision" as const,
      },
    ];

    for (const starter of starters) {
      const roomName = `${starter.template} starter ${Date.now()} ${Math.random().toString(36).slice(2)}`;
      const created = await createRoom(roomName, "private", starter.template, "locked");
      const roomId = created.room.id;

      assert.equal(created.room.access, "locked");
      assert.equal(created.room.visibility, "private");
      assert.equal(created.room.itemCount, starter.itemCount);
      assert.equal(created.room.connectionCount, starter.connectionCount);
      assert.equal(
        (await listRooms()).some((room) => room.id === roomId),
        false,
      );

      const ownerSnapshot = await getRoomSnapshot(roomId, { ownerToken: created.ownerToken });
      assert.ok(ownerSnapshot);
      assert.equal(ownerSnapshot.permissions.role, "owner");
      for (const itemId of starter.expectedItemIds) {
        assert.equal(
          ownerSnapshot.items.some((item) => item.id === itemId),
          true,
        );
      }
      if (starter.template === "visual-decision") {
        assert.equal(
          ownerSnapshot.items.every((item) => item.author === "Roomboard"),
          true,
        );
        assert.equal(
          ownerSnapshot.items.some((item) => item.type === "image"),
          false,
        );
        assert.equal(
          ownerSnapshot.items.some((item) => item.comments.length > 0),
          false,
        );
      }
      if (starter.template === "landing-review") {
        assert.equal(
          ownerSnapshot.items.every((item) => item.author === "Roomboard"),
          true,
        );
        assert.equal(
          ownerSnapshot.items.every((item) => item.comments.length === 0),
          true,
        );
        assert.equal(
          ownerSnapshot.items.some((item) => item.id === "note-visual-material"),
          true,
        );
        assert.equal(
          ownerSnapshot.items.some((item) => item.id === "note-decision-record"),
          true,
        );
        assert.equal(
          ownerSnapshot.items.some((item) => item.type === "image"),
          false,
        );
      }
    }
  });

  it("lists rooms joined from remembered invite tokens", async () => {
    const roomName = `Joined room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName);
    const roomId = created.room.id;
    const ownerSnapshot = await getRoomSnapshot(roomId, { ownerToken: created.ownerToken });

    assert.ok(ownerSnapshot?.inviteTokens?.editor);
    assert.equal(
      (await listRooms()).some((room) => room.id === roomId),
      false,
    );
    assert.equal(
      (await listRooms({ inviteTokens: { [roomId]: "bad-token" } })).some((room) => room.id === roomId),
      false,
    );
    const joinedRooms = await listRooms({ inviteTokens: { [roomId]: ownerSnapshot.inviteTokens.editor } });
    const joinedRoom = joinedRooms.find((room) => room.id === roomId);
    assert.ok(joinedRoom);
    assert.equal(joinedRoom.shareInvite, undefined);
  });

  it("can create guided starter rooms without making them public", async () => {
    const roomName = `Moodboard starter ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName, "private", "moodboard", "locked");
    const roomId = created.room.id;

    assert.equal(created.room.access, "locked");
    assert.equal(created.room.visibility, "private");
    assert.equal(created.room.itemCount, 5);
    assert.equal(created.room.connectionCount, 3);
    assert.equal(
      (await listRooms()).some((room) => room.id === roomId),
      false,
    );

    const ownerSnapshot = await getRoomSnapshot(roomId, { ownerToken: created.ownerToken });
    assert.ok(ownerSnapshot);
    assert.equal(ownerSnapshot.permissions.role, "owner");
    assert.equal(
      ownerSnapshot.items.some((item) => item.title === "Direction"),
      true,
    );
    assert.equal(
      ownerSnapshot.items.some((item) => item.title === "Reference A"),
      true,
    );
  });

  it("lists rooms joined from remembered invite tokens", async () => {
    const roomName = `Joined room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName);
    const roomId = created.room.id;
    const ownerSnapshot = await getRoomSnapshot(roomId, { ownerToken: created.ownerToken });

    assert.ok(ownerSnapshot?.inviteTokens?.editor);
    assert.equal(
      (await listRooms()).some((room) => room.id === roomId),
      false,
    );
    assert.equal(
      (await listRooms({ inviteTokens: { [roomId]: "bad-token" } })).some((room) => room.id === roomId),
      false,
    );
    assert.equal(
      (await listRooms({ inviteTokens: { [roomId]: ownerSnapshot.inviteTokens.editor } })).some(
        (room) => room.id === roomId,
      ),
      true,
    );
  });

  it("locks link rooms to invite tokens while keeping owner controls", async () => {
    const roomName = `Lifecycle room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName, "private", false, "link");
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    const ownerSnapshot = await getRoomSnapshot(roomId, ownerCredentials);
    assert.ok(ownerSnapshot);
    assert.equal(ownerSnapshot.permissions.role, "owner");
    assert.equal(ownerSnapshot.permissions.canManage, true);
    assert.equal(ownerSnapshot.inviteTokens?.editor, ownerSnapshot.inviteTokens?.editor?.trim());

    assert.equal(await canAccessRoom(roomId), true);
    assert.equal(await canEditRoom(roomId), true);

    const locked = await setRoomAccess(roomId, "locked", ownerCredentials);
    assert.equal(locked?.access, "locked");
    assert.equal(await canAccessRoom(roomId), false);
    assert.equal(await canEditRoom(roomId), false);

    const ownerAfterLock = await getRoomSnapshot(roomId, ownerCredentials);
    assert.ok(ownerAfterLock);
    assert.equal(ownerAfterLock.permissions.role, "owner");
    assert.equal(ownerAfterLock.permissions.canManage, true);
    assert.equal(await canAccessRoom(roomId, ownerCredentials), true);
    assert.equal(await canEditRoom(roomId, ownerCredentials), true);

    const viewerToken = ownerSnapshot.inviteTokens?.viewer;
    assert.ok(viewerToken);
    const viewerSnapshot = await getRoomSnapshot(roomId, { inviteToken: viewerToken });
    assert.ok(viewerSnapshot);
    assert.equal(viewerSnapshot.permissions.role, "viewer");
    assert.equal(viewerSnapshot.permissions.canEdit, false);
    assert.equal(viewerSnapshot.inviteTokens, undefined);

    const editorToken = ownerSnapshot.inviteTokens?.editor;
    assert.ok(editorToken);
    const editorSnapshot = await getRoomSnapshot(roomId, { inviteToken: editorToken });
    assert.ok(editorSnapshot);
    assert.equal(editorSnapshot.permissions.role, "editor");
    assert.equal(editorSnapshot.permissions.canEdit, true);
    assert.equal(editorSnapshot.permissions.canManage, false);
  });

  it("removes closed rooms from snapshots, access checks, and recent rooms", async () => {
    const roomName = `Closed room ${Date.now()} ${Math.random().toString(36).slice(2)}`;
    const created = await createRoom(roomName);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    const closed = await closeRoom(roomId, ownerCredentials);
    assert.equal(closed?.id, roomId);
    assert.equal(await getRoomSnapshot(roomId, ownerCredentials), null);
    assert.equal(await canAccessRoom(roomId, ownerCredentials), false);
    assert.equal(
      (await listRooms()).some((room) => room.id === roomId),
      false,
    );
  });

  it("lets only the owner publish and revoke a public read-only snapshot without opening the live room", async () => {
    const created = await createRoom(`Snapshot room ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    assert.equal(await getPublicRoomSnapshot(roomId), null);
    assert.equal(await getRoomSnapshot(roomId), null);
    assert.equal(await setRoomSnapshotPublic(roomId, true, { ownerToken: "wrong-token" }), null);

    const shared = await setRoomSnapshotPublic(roomId, true, ownerCredentials);
    assert.equal(shared?.isSnapshotPublic, true);
    assert.equal(await getRoomSnapshot(roomId), null);

    const publicSnapshot = await getPublicRoomSnapshot(roomId);
    assert.equal(publicSnapshot?.permissions.role, "viewer");
    assert.equal(publicSnapshot?.permissions.canEdit, false);
    assert.equal(publicSnapshot?.room.isSnapshotPublic, true);

    const revoked = await setRoomSnapshotPublic(roomId, false, ownerCredentials);
    assert.equal(revoked?.isSnapshotPublic, false);
    assert.equal(await getPublicRoomSnapshot(roomId), null);
  });

  it("persists card style updates for owner and viewer snapshots", async () => {
    const created = await createRoom(`Styled room ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };
    const item = await createRoomItem(
      {
        author: "Ilya",
        color: "#facc5c",
        title: "Decision card",
        type: "note",
      },
      roomId,
    );

    assert.ok(item);
    const updated = await updateRoomItem(
      {
        body: "Keep the supporting notes",
        id: item.id,
        styleVariant: "highlight",
        title: "Renamed decision card",
      },
      roomId,
    );
    const ownerSnapshot = await getRoomSnapshot(roomId, ownerCredentials);
    const viewerToken = ownerSnapshot?.inviteTokens?.viewer;

    assert.equal(updated?.styleVariant, "highlight");
    assert.equal(updated?.title, "Renamed decision card");
    assert.equal(updated?.body, "Keep the supporting notes");
    assert.equal(ownerSnapshot?.items.find((candidate) => candidate.id === item.id)?.styleVariant, "highlight");
    assert.ok(viewerToken);

    const viewerSnapshot = await getRoomSnapshot(roomId, { inviteToken: viewerToken });
    assert.equal(viewerSnapshot?.items.find((candidate) => candidate.id === item.id)?.styleVariant, "highlight");
  });

  it("duplicates a card as a new offset work item without copying comments or connections", async () => {
    const created = await createRoom(`Duplicate room ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };
    const source = await createRoomItem(
      {
        author: "Ilya",
        body: "Keep the visual hierarchy and feedback context.",
        color: "#facc5c",
        height: 180,
        status: "reviewing",
        title: "Homepage direction",
        type: "note",
        width: 280,
        x: 120,
        y: 80,
      },
      roomId,
    );

    assert.ok(source);
    await updateRoomItem({ id: source.id, body: source.body, styleVariant: "highlight" }, roomId);
    const duplicated = await duplicateRoomItem(source.id, roomId, "Nora");
    const snapshot = await getRoomSnapshot(roomId, ownerCredentials);

    assert.ok(duplicated);
    assert.notEqual(duplicated.id, source.id);
    assert.equal(duplicated.title, "Copy of Homepage direction");
    assert.equal(duplicated.body, source.body);
    assert.equal(duplicated.author, "Nora");
    assert.equal(duplicated.status, source.status);
    assert.equal(duplicated.styleVariant, "highlight");
    assert.equal(duplicated.x, source.x + 40);
    assert.equal(duplicated.y, source.y + 40);
    assert.deepEqual(duplicated.comments, []);
    assert.equal(snapshot?.items.filter((item) => item.id === source.id || item.id === duplicated.id).length, 2);
    assert.equal(
      snapshot?.activities.some(
        (activity) => activity.itemId === duplicated.id && activity.message === 'Duplicated "Homepage direction".',
      ),
      true,
    );
  });
});

describe("room item style variants", () => {
  it("accepts only supported card styles", () => {
    assert.equal(isRoomItemStyleVariant("minimal"), true);
    assert.equal(isRoomItemStyleVariant("highlight"), true);
    assert.equal(isRoomItemStyleVariant("spotlight"), false);
    assert.equal(isRoomItemStyleVariant(null), false);
  });
});

describe("buildRoomRecap", () => {
  it("groups cards by review status and summarizes decision progress", () => {
    const items = [
      makeItem({
        id: "approved-note",
        status: "approved",
        title: "Homepage direction",
        comments: [{ id: "comment-1", author: "Mira", body: "Ship it.", color: "#10b981", createdAt: updatedAt }],
      }),
      makeItem({
        id: "reference-image",
        type: "image",
        status: "reviewing",
        title: "Reference mood",
        imageUrl: "https://www.example.com/assets/mood.png",
        updatedAt: updatedAt - 500,
      }),
      makeItem({ id: "changes-note", status: "changes_requested", title: "Revise copy" }),
    ];

    const recap = buildRoomRecap(
      makeSnapshot(items, [
        makeActivity({ createdAt: updatedAt - 100 }),
        makeActivity({ id: "activity-2", createdAt: updatedAt }),
      ]),
    );

    assert.equal(recap.roomId, "review-room");
    assert.equal(recap.totalItems, 3);
    assert.equal(recap.decidedCount, 2);
    assert.equal(recap.unresolvedCount, 1);
    assert.equal(recap.noteCount, 2);
    assert.equal(recap.imageCount, 1);
    assert.equal(recap.commentCount, 1);
    assert.equal(recap.connectionCount, 1);
    assert.deepEqual(
      recap.sections.map((section) => [section.status, section.count]),
      [
        ["approved", 1],
        ["changes_requested", 1],
        ["reviewing", 1],
        ["open", 0],
      ],
    );
    assert.equal(recap.sections[2].items[0].source, "example.com");
    assert.deepEqual(
      recap.recentActivities.map((activity) => activity.id),
      ["activity-2", "activity-1"],
    );
    assert.match(recap.markdown, /Progress: 2\/3 cards decided, 1 unresolved/);
    assert.match(recap.markdown, /- Reference mood .*source: example\.com/);
  });

  it("keeps exported markdown compact for long card bodies", () => {
    const longBody = "  This   text should be normalized before it is exported. ".repeat(6);
    const recap = buildRoomRecap(makeSnapshot([makeItem({ body: longBody, status: "approved", title: "Decision" })]));
    const decisionLine = recap.markdown.split("\n").find((line) => line.startsWith("- Decision"));

    if (!decisionLine) {
      assert.fail("expected the approved decision to appear in markdown");
    }

    assert.ok(decisionLine.length < 190, `expected compact decision line, got ${decisionLine.length} chars`);
    assert.match(decisionLine, /\.\.\./);
    assert.doesNotMatch(decisionLine, /\s{2,}/);
  });
});

describe("buildRoomDecisionBrief", () => {
  it("puts requested revisions ahead of unresolved cards and gives the snapshot a concrete next action", () => {
    const brief = buildRoomDecisionBrief([
      makeItem({ id: "approved", status: "approved", title: "Approved direction" }),
      makeItem({ id: "open", status: "open", title: "Open question", updatedAt: updatedAt }),
      makeItem({ id: "review", status: "reviewing", title: "In review", updatedAt: updatedAt - 100 }),
      makeItem({ id: "revisions", status: "changes_requested", title: "Revise headline", updatedAt: updatedAt - 1000 }),
    ]);

    assert.equal(brief.approvedCount, 1);
    assert.equal(brief.pendingCount, 2);
    assert.equal(brief.revisionCount, 1);
    assert.match(brief.headline, /1 card needs revisions/i);
    assert.deepEqual(brief.nextStep, {
      id: "revisions",
      status: "changes_requested",
      title: "Revise headline",
    });
    assert.deepEqual(
      brief.nextSteps.map((item) => item.id),
      ["revisions", "review", "open"],
    );
  });

  it("marks an all-approved board as ready to share", () => {
    const brief = buildRoomDecisionBrief([makeItem({ status: "approved", title: "Ship the landing page" })]);

    assert.equal(brief.pendingCount, 0);
    assert.equal(brief.revisionCount, 0);
    assert.equal(brief.nextStep, undefined);
    assert.equal(brief.nextSteps.length, 0);
    assert.match(brief.headline, /ready to share/i);
  });
});

describe("getLifecycleCopy", () => {
  const ownerPerms: RoomPermissions = { canEdit: true, canManage: true, role: "owner" };
  const editorPerms: RoomPermissions = { canEdit: true, canManage: false, role: "editor" };
  const viewerPerms: RoomPermissions = { canEdit: false, canManage: false, role: "viewer" };

  it("greets owner opening a fresh link-access room with a primary CTA", () => {
    const copy = getLifecycleCopy(ownerPerms, "link", "  Ilya  ", false);

    assert.equal(copy.accessBadge, "Open · link access");
    assert.match(copy.emptyStateTitle, /Ilya/);
    assert.equal(copy.emptyStateAction, "Add the first card");
    assert.match(copy.accessBanner, /invite-only/);
  });

  it("explains lock state to an editor with an active editor invite", () => {
    const copy = getLifecycleCopy(editorPerms, "locked", "Mira", true);

    assert.equal(copy.accessBadge, "Locked · editor");
    assert.match(copy.accessBanner, /invite-only/);
    assert.match(copy.emptyStateBody, /realtime/);
  });

  it("onboards a locked-room owner toward the first decision question", () => {
    const copy = getLifecycleCopy(ownerPerms, "locked", "Ilya", false);

    assert.equal(copy.accessBadge, "Locked · invite only");
    assert.match(copy.emptyStateTitle, /start with one decision question/i);
    assert.match(copy.emptyStateBody, /decision note, screenshot, or reference/i);
    assert.equal(copy.emptyStateAction, "Copy editor link");
  });

  it("sends empty read-only viewers to the rooms console", () => {
    const copy = getLifecycleCopy(viewerPerms, "locked", "", false);

    assert.equal(copy.accessBadge, "Locked · viewer");
    assert.match(copy.accessBanner, /viewer link/);
    assert.match(copy.emptyStateTitle, /guest/);
    assert.equal(copy.emptyStateAction, "Open rooms console");
  });
});

describe("getProfileJoinCopy", () => {
  const ownerPerms: RoomPermissions = { canEdit: true, canManage: true, role: "owner" };
  const editorPerms: RoomPermissions = { canEdit: true, canManage: false, role: "editor" };
  const viewerPerms: RoomPermissions = { canEdit: false, canManage: false, role: "viewer" };

  it("sets clear first-join copy for invited editors", () => {
    const copy = getProfileJoinCopy(editorPerms);

    assert.equal(copy.action, "Enter as editor");
    assert.equal(copy.title, "Enter as editor");
    assert.match(copy.body, /No account is needed/);
    assert.match(copy.body, /editor invite/);
    assert.match(copy.body, /add cards/);
    assert.match(copy.body, /comment/);
  });

  it("sets read-only first-join copy for viewers", () => {
    const copy = getProfileJoinCopy(viewerPerms);

    assert.equal(copy.action, "Enter as viewer");
    assert.equal(copy.title, "Enter as viewer");
    assert.match(copy.body, /No account is needed/);
    assert.match(copy.body, /read-only/);
    assert.match(copy.body, /without changing the board/);
  });

  it("keeps owner first-join copy focused on creator controls", () => {
    const copy = getProfileJoinCopy(ownerPerms);

    assert.equal(copy.action, "Enter room");
    assert.equal(copy.title, "Choose your display name");
    assert.match(copy.body, /No account is needed/);
    assert.match(copy.body, /this browser keeps creator access/);
    assert.match(copy.body, /owner backup/);
  });

  it("toggles decision signals by stable editor identity and exports them in the recap", async () => {
    const created = await createRoom(`Decision signal ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const item = await createRoomItem(
      { author: "Ilya", body: "Choose the launch direction", color: "#facc5c", title: "Concept A", type: "note" },
      created.room.id,
    );

    assert.ok(item);
    assert.equal(
      (
        await toggleRoomItemDecisionSignal(
          { color: "#48a7ff", itemId: item.id, voter: "Nora", voterId: "editor-nora" },
          created.room.id,
        )
      )?.decisionSignals?.length,
      1,
    );
    assert.equal(
      (
        await toggleRoomItemDecisionSignal(
          { color: "#facc5c", itemId: item.id, voter: "Nora", voterId: "editor-river" },
          created.room.id,
        )
      )?.decisionSignals?.length,
      2,
    );
    assert.equal(
      (
        await toggleRoomItemDecisionSignal(
          { color: "#48a7ff", itemId: item.id, voter: "Nora renamed", voterId: "editor-nora" },
          created.room.id,
        )
      )?.decisionSignals?.length,
      1,
    );
    assert.equal(
      (
        await toggleRoomItemDecisionSignal(
          { color: "#48a7ff", itemId: item.id, voter: "Nora renamed", voterId: "editor-nora" },
          created.room.id,
        )
      )?.decisionSignals?.length,
      2,
    );

    const snapshot = await getRoomSnapshot(created.room.id, { ownerToken: created.ownerToken });
    assert.ok(snapshot);
    assert.match(buildRoomRecap(snapshot).markdown, /2 decision signals/);
  });
});

describe("mutating a room that is already gone", () => {
  it("rejects with a recognizable RoomNotFoundError instead of a generic failure", async () => {
    const created = await createRoom(`Closed room mutation ${Date.now()} ${Math.random().toString(36).slice(2)}`);
    const roomId = created.room.id;
    const ownerCredentials = { ownerToken: created.ownerToken };

    assert.ok(await closeRoom(roomId, ownerCredentials));

    await assert.rejects(
      () =>
        createRoomItem({ author: "Ilya", body: "Late write", color: "#48a7ff", title: "Late", type: "note" }, roomId),
      (error: unknown) => {
        assert.ok(isRoomNotFoundError(error), "expected the closed-room write to raise RoomNotFoundError");
        assert.equal((error as RoomNotFoundError).roomId, roomId);
        return true;
      },
    );
  });

  it("keeps unrelated failures out of the not-found path", () => {
    assert.equal(isRoomNotFoundError(new Error("Supabase unreachable")), false);
    assert.equal(isRoomNotFoundError(null), false);
    assert.equal(isRoomNotFoundError('Room "x" not found.'), false);
  });
});
