import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { PRESENCE_TTL_MS, pruneStalePresence } from "../lib/presenceTtl.ts";
import type { PresenceSnapshot } from "../lib/presence.ts";

const now = 10_000_000;

function snapshot(overrides: Partial<PresenceSnapshot> = {}): PresenceSnapshot {
  return {
    id: "u1",
    name: "Ada",
    color: "#facc5c",
    focus: "canvas",
    x: 0,
    y: 0,
    updatedAt: now,
    ...overrides,
  };
}

describe("pruneStalePresence", () => {
  it("keeps snapshots newer than the TTL", () => {
    const fresh = snapshot({ id: "a", updatedAt: now - 1_000 });
    assert.deepEqual(pruneStalePresence([fresh], now), [fresh]);
  });

  it("drops snapshots older than the TTL (AC #5: stale collaborators disappear)", () => {
    const stale = snapshot({ id: "a", updatedAt: now - PRESENCE_TTL_MS - 1 });
    assert.deepEqual(pruneStalePresence([stale], now), []);
  });

  it("drops a snapshot exactly at the TTL boundary (strict-less-than keep policy)", () => {
    const edge = snapshot({ id: "a", updatedAt: now - PRESENCE_TTL_MS });
    assert.deepEqual(pruneStalePresence([edge], now), []);
  });

  it("keeps a snapshot just under the TTL boundary", () => {
    const edge = snapshot({ id: "a", updatedAt: now - PRESENCE_TTL_MS + 1 });
    assert.deepEqual(pruneStalePresence([edge], now), [edge]);
  });

  it("returns remaining snapshots newest-first when something is pruned", () => {
    const older = snapshot({ id: "a", updatedAt: now - 5_000 });
    const newer = snapshot({ id: "b", updatedAt: now - 1_000 });
    const stale = snapshot({ id: "c", updatedAt: now - PRESENCE_TTL_MS - 100 });
    // Sort verification: after dropping the stale entry, the result must be
    // newest-first. We assert the full order rather than just length so the
    // no-op fast path can't accidentally regress this invariant.
    assert.deepEqual(pruneStalePresence([stale, older, newer], now), [newer, older]);
  });

  it("returns the same array reference when nothing is stale (no-op fast path)", () => {
    const fresh = [snapshot({ id: "a", updatedAt: now - 1_000 }), snapshot({ id: "b", updatedAt: now - 2_000 })];
    assert.equal(pruneStalePresence(fresh, now), fresh);
  });

  it("returns the same array reference for an empty list", () => {
    const empty: PresenceSnapshot[] = [];
    assert.equal(pruneStalePresence(empty, now), empty);
  });

  it("drops stale entries while preserving fresh ones in a mixed list", () => {
    const fresh = snapshot({ id: "fresh", updatedAt: now - 1_000 });
    const stale = snapshot({ id: "stale", updatedAt: now - PRESENCE_TTL_MS - 100 });
    assert.deepEqual(pruneStalePresence([stale, fresh], now), [fresh]);
  });

  it("handles an empty list", () => {
    assert.deepEqual(pruneStalePresence([], now), []);
  });

  it("returns an empty list when every snapshot is stale", () => {
    const stale = [
      snapshot({ id: "a", updatedAt: now - PRESENCE_TTL_MS - 1 }),
      snapshot({ id: "b", updatedAt: now - PRESENCE_TTL_MS - 5_000 }),
    ];
    assert.deepEqual(pruneStalePresence(stale, now), []);
  });

  it("uses Date.now() and the default TTL when arguments are omitted", () => {
    const fresh = snapshot({ id: "a", updatedAt: Date.now() - 1_000 });
    assert.equal(pruneStalePresence([fresh]).length, 1);

    const stale = snapshot({ id: "b", updatedAt: Date.now() - PRESENCE_TTL_MS - 1_000 });
    assert.equal(pruneStalePresence([stale]).length, 0);
  });

  it("respects a custom ttlMs", () => {
    const snap = snapshot({ id: "a", updatedAt: now - 500 });
    assert.deepEqual(pruneStalePresence([snap], now, 250), []);
    assert.equal(pruneStalePresence([snap], now, 1_000).length, 1);
  });

  it("deduplicates by keeping only one entry per id when already unique", () => {
    // pruneStalePresence does not merge; it only filters/sorts. Distinct ids are preserved.
    const a = snapshot({ id: "a", updatedAt: now - 1_000 });
    const b = snapshot({ id: "b", updatedAt: now - 2_000 });
    assert.deepEqual(pruneStalePresence([a, b], now), [a, b]);
  });
});
