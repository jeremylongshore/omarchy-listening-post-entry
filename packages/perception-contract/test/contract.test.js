import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { validateSnapshot } from "../index.js";

const fixtureUrl = new URL("../fixtures/snapshot-v1.json", import.meta.url);
const fixture = async () => JSON.parse(await readFile(fixtureUrl, "utf8"));

test("the canonical v1 fixture satisfies the shared contract", async () => {
  assert.deepEqual(validateSnapshot(await fixture()), { valid: true, errors: [] });
});

test("rejects unsafe links and dangling brief references", async () => {
  const snapshot = await fixture();
  snapshot.signals[0].url = "http://127.0.0.1/private";
  snapshot.brief.highlights[0].signalId = "missing";
  const result = validateSnapshot(snapshot);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /signals\[0\]/);
  assert.match(result.errors.join("\n"), /does not reference a signal/);
});

test("enforces topic resource bounds", async () => {
  const snapshot = await fixture();
  snapshot.topics = Array.from({ length: 9 }, (_, index) => ({ id: `topic_${index}`, name: `Topic ${index}`, keywords: ["safe"], enabled: true }));
  const result = validateSnapshot(snapshot);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /at most 8/);
});
