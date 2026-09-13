import type { PerceptionSnapshot } from "@listening-post/perception-contract";
import type { Device } from "./api";

export const ONBOARDING_STORAGE_KEY = "perception:onboarding:v1";

export type ActivationState = {
  topicReady:boolean;
  firstSignalRead:boolean;
  devicePaired:boolean;
  coreComplete:boolean;
};

export function activationState(snapshot:PerceptionSnapshot, devices:Device[]):ActivationState {
  const topicReady = snapshot.topics.some((topic) => topic.enabled);
  const firstSignalRead = snapshot.signals.some((signal) => signal.read);
  const devicePaired = devices.length > 0;
  return { topicReady, firstSignalRead, devicePaired, coreComplete:topicReady && firstSignalRead };
}

export function onboardingWasClosed(storage:Pick<Storage, "getItem">):boolean {
  try { return storage.getItem(ONBOARDING_STORAGE_KEY) === "closed"; }
  catch { return false; }
}

export function closeOnboarding(storage:Pick<Storage, "setItem">):void {
  try { storage.setItem(ONBOARDING_STORAGE_KEY, "closed"); }
  catch { /* The guide may return when storage is unavailable. Product access still works. */ }
}
