import { describe, expect, it } from "vitest";
import { validateSnapshot } from "@listening-post/perception-contract";
import { magicTokenFromHash } from "./api";
import fixture from "../../packages/perception-contract/fixtures/snapshot-v1.json";
describe("Perception web contract", () => {
  it("accepts the shared snapshot fixture", () => expect(validateSnapshot(fixture)).toEqual({ valid: true, errors: [] }));
  it("accepts only bounded opaque magic tokens from a URL fragment", () => {
    const token = "a".repeat(43);
    expect(magicTokenFromHash(`#magic=${token}`)).toBe(token);
    expect(magicTokenFromHash(`#magic=short`)).toBeNull();
    expect(magicTokenFromHash(`?magic=${token}`)).toBeNull();
  });
});
