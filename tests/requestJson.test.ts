import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readJsonBody } from "../lib/requestJson.ts";

describe("readJsonBody", () => {
  it("parses a bounded JSON object", async () => {
    const result = await readJsonBody<{ room: string }>(
      new Request("https://roomboard.test", {
        body: JSON.stringify({ room: "Launch approval" }),
        method: "POST",
      }),
    );

    assert.deepEqual(result, { ok: true, value: { room: "Launch approval" } });
  });

  it("returns a stable 400 for empty and malformed input", async () => {
    assert.deepEqual(await readJsonBody(new Request("https://roomboard.test", { body: " ", method: "POST" })), {
      error: "A JSON body is required.",
      ok: false,
      status: 400,
    });
    assert.deepEqual(await readJsonBody(new Request("https://roomboard.test", { body: "{", method: "POST" })), {
      error: "The request body must be valid JSON.",
      ok: false,
      status: 400,
    });
    for (const body of ["null", '"room"', "42", "[]"]) {
      assert.deepEqual(await readJsonBody(new Request("https://roomboard.test", { body, method: "POST" })), {
        error: "The request body must be a JSON object.",
        ok: false,
        status: 400,
      });
    }
  });

  it("rejects bodies that exceed the byte limit even without content-length", async () => {
    const request = new Request("https://roomboard.test", {
      body: JSON.stringify({ body: "ééé" }),
      method: "POST",
    });

    assert.deepEqual(await readJsonBody(request, 12), {
      error: "JSON body must be 12 bytes or smaller.",
      ok: false,
      status: 413,
    });
  });
});
