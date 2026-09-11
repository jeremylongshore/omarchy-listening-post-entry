import { describe, expect, it } from "vitest";
import { validateSnapshot } from "@listening-post/perception-contract";
import fixture from "../../packages/perception-contract/fixtures/snapshot-v1.json";
describe("Perception web contract", () => {
  it("accepts the shared snapshot fixture", () => expect(validateSnapshot(fixture)).toEqual({ valid: true, errors: [] }));
});
