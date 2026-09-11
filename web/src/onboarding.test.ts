import { describe, expect, it } from "vitest";
import fixture from "../../packages/perception-contract/fixtures/snapshot-v1.json";
import { activationState, closeOnboarding, onboardingWasClosed } from "./onboarding";
import type { PerceptionSnapshot } from "@listening-post/perception-contract";

describe("Perception activation guide", () => {
  it("treats topic plus first opened signal as core value and pairing as optional", () => {
    const snapshot = structuredClone(fixture) as PerceptionSnapshot;
    snapshot.signals.forEach((signal) => { signal.read = false; });
    expect(activationState(snapshot, [])).toMatchObject({ topicReady:true, firstSignalRead:false, devicePaired:false, coreComplete:false });
    snapshot.signals[0].read = true;
    expect(activationState(snapshot, [{ id:"device_1", label:"Omarchy", createdAt:new Date().toISOString(), lastSeenAt:null }])).toEqual({ topicReady:true, firstSignalRead:true, devicePaired:true, coreComplete:true });
  });

  it("fails open when browser storage is unavailable", () => {
    const unavailable = { getItem(){ throw new Error("blocked"); }, setItem(){ throw new Error("blocked"); } };
    expect(onboardingWasClosed(unavailable)).toBe(false);
    expect(() => closeOnboarding(unavailable)).not.toThrow();
  });
});
