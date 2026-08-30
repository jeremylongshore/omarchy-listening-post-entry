#!/usr/bin/env bash
# Acceptance lane: static rig checks plus a populated live Listening Post render.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
"$ROOT/scripts/rig-verify.sh" "$ROOT"
"$ROOT/scripts/rig-render.sh" "$ROOT" "$ROOT/preview.png"
test -s "$ROOT/preview.png"
jq -e '.sourceDirty == false and .sourcePackageSha256 == .remotePackageSha256
  and .omarchyPluginValidate == 0 and .qmllintErrors == 0' \
  "$ROOT/.rig-proof.json" >/dev/null
jq -e '.sourceDirty == false and .sourcePackageSha256 == .remotePackageSha256
  and (.previewSha256 | length == 64) and .dimensions == "1280 x 720"
  and .nonblackCoverage >= 0.35 and (.runId | length > 0)
  and (.rawShellLogSha256 | length == 64) and (.fixtureSha256 | length == 64)
  and .storyEvidence.sourceCount == 29 and .storyEvidence.laneCount == 4
  and .storyEvidence.activeIncidentCount == 1
  and .storyEvidence.releaseCount >= 1 and .storyEvidence.pricingCount >= 1
  and .storyEvidence.engineeringCount >= 1 and .outputScale == 1.25
  and .visualInspection.status == "pending"
  and .primaryAction == "live production poll completed and IPC opened all four lanes"' \
  "$ROOT/.render-proof.json" >/dev/null
