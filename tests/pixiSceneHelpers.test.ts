import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { RoomItem } from "../lib/canvasRoom.ts";
import {
  clampZoom,
  getImageCardSize,
  getImageDisplayBody,
  getImageDisplayTitle,
  getItemStatusMeta,
  getPixiTextResolution,
  getDomain,
  mixHex,
  toColor,
  truncate,
  truncateForWidth,
  maxCanvasZoom,
  minCanvasZoom,
} from "../lib/pixiScene.ts";

function imageItem(overrides: Partial<RoomItem> = {}): RoomItem {
  return {
    id: "item-1",
    type: "image",
    title: "Custom title",
    body: "Custom body",
    imageUrl: "https://example.com/asset.png",
    comments: [],
    status: "open",
    width: 300,
    height: 300,
    x: 0,
    y: 0,
    ...overrides,
  } as RoomItem;
}

describe("zoom bounds", () => {
  it("exports the documented zoom limits", () => {
    assert.equal(minCanvasZoom, 0.2);
    assert.equal(maxCanvasZoom, 8);
  });

  it("clamps zoom into the [0.2, 8] window", () => {
    assert.equal(clampZoom(0.05), 0.2);
    assert.equal(clampZoom(50), 8);
  });

  it("keeps in-range scales untouched", () => {
    assert.equal(clampZoom(0.2), 0.2);
    assert.equal(clampZoom(1), 1);
    assert.equal(clampZoom(8), 8);
  });
});

describe("getPixiTextResolution", () => {
  it("raises the resolution with zoom on a ceil(scale*2) ladder", () => {
    assert.equal(getPixiTextResolution(1), 4); // ceil(1*2)=2, clamped up to the floor of 4
    assert.equal(getPixiTextResolution(4), 8);
    assert.equal(getPixiTextResolution(6.1), 13);
  });

  it("stays within the [4, 18] resolution window", () => {
    assert.equal(getPixiTextResolution(0.01), 4);
    assert.equal(getPixiTextResolution(100), 18);
  });
});

describe("color helpers", () => {
  it("parses hex strings to pixi numbers", () => {
    assert.equal(toColor("#ff0000"), 0xff0000);
    assert.equal(toColor("0ea5e9"), 0x0ea5e9);
  });

  it("weights mixHex toward the first color by amount", () => {
    assert.equal(mixHex("#ff0000", "#0000ff", 1), 0xff0000);
    assert.equal(mixHex("#ff0000", "#0000ff", 0), 0x0000ff);
    assert.equal(mixHex("#ff0000", "#0000ff", 0.5), 0x800080);
  });

  it("falls back to the mix target when a color is unparseable", () => {
    assert.equal(mixHex("not-a-color", "#123456", 0.5), 0x123456);
  });
});

describe("getItemStatusMeta", () => {
  it("maps every reviewer status to a stable color/label pair", () => {
    assert.deepEqual(getItemStatusMeta("approved"), { color: "#10b981", label: "Approved", short: "Approved" });
    assert.deepEqual(getItemStatusMeta("reviewing"), { color: "#0ea5e9", label: "Reviewing", short: "Review" });
    assert.deepEqual(getItemStatusMeta("changes_requested"), {
      color: "#f43f5e",
      label: "Changes requested",
      short: "Changes",
    });
  });

  it("treats unknown statuses as open rather than throwing", () => {
    assert.deepEqual(getItemStatusMeta("open"), { color: "#8a909a", label: "Open", short: "Open" });
    assert.deepEqual(getItemStatusMeta("unexpected" as RoomItem["status"]), {
      color: "#8a909a",
      label: "Open",
      short: "Open",
    });
  });
});

describe("getDomain", () => {
  it("returns the hostname without the www prefix", () => {
    assert.equal(getDomain("https://www.example.com/p/1"), "example.com");
    assert.equal(getDomain("https://figma.com/file/x"), "figma.com");
  });

  it("falls back to the generic label for missing or unparseable urls", () => {
    assert.equal(getDomain(undefined), "Link");
    assert.equal(getDomain(""), "Link");
    assert.equal(getDomain("not a url"), "Link");
  });
});

describe("text truncation", () => {
  it("leaves short text alone", () => {
    assert.equal(truncate("short"), "short");
    assert.equal(truncate("x".repeat(96)), "x".repeat(96));
  });

  it("cuts long text to the limit minus the ellipsis", () => {
    const long = "y".repeat(200);
    assert.equal(truncate(long).length, 97);
    assert.ok(truncate(long).endsWith("..."));
    assert.equal(truncate(long), `${"y".repeat(94)}...`);
  });

  it("derives the character budget from the pixel width with a floor", () => {
    assert.equal(truncateForWidth("abcdefghij", 70), "abcdefghij");
    assert.equal(truncateForWidth("abcdefghijklmnop", 70).length, 11); // budget floor(70/7)=10, +3 for "..." minus 2
    assert.equal(truncateForWidth("truncate-me-please", 10), "trunca..."); // budget max(8, floor(10/7))=8 -> first 6 chars + "..."
  });
});

describe("getImageDisplayTitle", () => {
  it("keeps a real title untouched", () => {
    assert.equal(getImageDisplayTitle(imageItem({ title: "Hero screenshot v2" })), "Hero screenshot v2");
  });

  it("replaces placeholder titles with the source domain", () => {
    assert.equal(
      getImageDisplayTitle(imageItem({ title: "Image reference", imageUrl: "https://cdn.example.com/a.png" })),
      "Reference from cdn.example.com",
    );
  });

  it("falls back to the generic label when no url is attached", () => {
    assert.equal(getImageDisplayTitle(imageItem({ title: "Visual Reference", imageUrl: undefined })), "Visual reference");
  });
});

describe("getImageDisplayBody", () => {
  it("keeps a real body untouched", () => {
    assert.equal(getImageDisplayBody(imageItem({ body: "Needs a tighter crop" })), "Needs a tighter crop");
  });

  it("summarises captured comments once the default body is stale", () => {
    const item = imageItem({
      body: "Image reference for review.",
      comments: [{ id: "c1" }, { id: "c2" }] as RoomItem["comments"],
    });

    assert.equal(getImageDisplayBody(item), "2 review notes captured.");
    assert.equal(
      getImageDisplayBody(imageItem({ body: "", comments: [{ id: "c1" }] as RoomItem["comments"] })),
      "1 review note captured.",
    );
  });

  it("tells an empty card apart from a saved source", () => {
    assert.equal(getImageDisplayBody(imageItem({ body: "" })), "Source saved - ready for review.");
    assert.equal(getImageDisplayBody(imageItem({ body: "", imageUrl: undefined })), "Paste a URL or upload to start review.");
  });
});

describe("getImageCardSize", () => {
  it("uses the default frame for missing or non-positive dimensions", () => {
    assert.deepEqual(getImageCardSize(), { width: 268, height: 220 });
    assert.deepEqual(getImageCardSize(0, 500), { width: 268, height: 220 });
    assert.deepEqual(getImageCardSize(-10, 500), { width: 268, height: 220 });
  });

  it("keeps the source aspect ratio within the frame bounds and adds card chrome", () => {
    // 4:3 source, large: frame pinned to max width 420 -> 315 high.
    assert.deepEqual(getImageCardSize(800, 600), { width: 452, height: 459 });
    // 1:1 source at 300px: frame 300x300 plus chrome.
    assert.deepEqual(getImageCardSize(300, 300), { width: 332, height: 444 });
  });

  it("clamps extreme aspects into the 0.35..3.2 window", () => {
    // 5:1 panorama: ratio clamped to 3.2 -> frame 420 x 131.25.
    assert.deepEqual(getImageCardSize(1000, 200), { width: 452, height: 275 });
    // 1:10 portrait: ratio clamped to 0.35, height capped at 320, width re-clamped to the 220 floor.
    assert.deepEqual(getImageCardSize(100, 1000), { width: 252, height: 464 });
  });
});
