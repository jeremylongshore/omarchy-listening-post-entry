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

test("requires incident-resolution and quiet-attention metadata", async () => {
  const snapshot = await fixture();
  delete snapshot.signals[0].resolved;
  delete snapshot.signals[1].quiet;
  const result = validateSnapshot(snapshot);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /signals\[0\]/);
  assert.match(result.errors.join("\n"), /signals\[1\]/);
});

test("requires signal ids that are safe for native deep links", async () => {
  const snapshot = await fixture();
  snapshot.signals[0].id = "signal/unsafe";
  const result = validateSnapshot(snapshot);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /signals\[0\]/);
});

test("rejects unknown fields at every strict object boundary", async () => {
  const mutations = [
    (snapshot) => { snapshot.unknown = true; },
    (snapshot) => { snapshot.account.unknown = true; },
    (snapshot) => { snapshot.topics[0].unknown = true; },
    (snapshot) => { snapshot.signals[0].unknown = true; },
    (snapshot) => { snapshot.brief.unknown = true; },
    (snapshot) => { snapshot.brief.highlights[0].unknown = true; },
    (snapshot) => { snapshot.sourceHealth[0].unknown = true; }
  ];
  for (const mutate of mutations) {
    const snapshot = await fixture();
    mutate(snapshot);
    assert.equal(validateSnapshot(snapshot).valid, false);
  }
});

test("rejects reversed time windows and oversized source health", async () => {
  const snapshot = await fixture();
  snapshot.staleAfter = "2026-09-01T00:00:00.000Z";
  snapshot.brief.windowEnd = "2026-09-01T00:00:00.000Z";
  snapshot.sourceHealth = Array.from({ length: 65 }, (_, index) => ({
    id: `source_${index}`, name: `Source ${index}`, status: "healthy", checkedAt: "2026-09-12T00:00:00.000Z"
  }));
  const result = validateSnapshot(snapshot);
  assert.equal(result.valid, false);
  assert.match(result.errors.join("\n"), /staleAfter/);
  assert.match(result.errors.join("\n"), /windowEnd/);
  assert.match(result.errors.join("\n"), /sourceHealth/);
});
