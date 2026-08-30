#!/usr/bin/env bash
# Run Listening Post inside an isolated real Omarchy shell, serve deterministic
# scrubbed feeds through the unchanged curl boundary, complete the production
# poll, open the real panel, and capture the dedicated 16:9 output directly.
set -euo pipefail

TARGET="$(cd "${1:-$(dirname "$0")/..}" && pwd)"
OUT="${2:-$TARGET/preview.png}"
HOST="${OMARCHY_RIG_HOST:-intent-ops-buzz}"
CONTAINER="${OMARCHY_RIG_CONTAINER:-omarchy-rig}"
RES="${OMARCHY_RIG_RESOLUTION:-1280x720}"
SCALE="${OMARCHY_RIG_SCALE:-1.25}"

for tool in jq identify convert; do
  command -v "$tool" >/dev/null 2>&1 || { echo "rig-render: $tool is required" >&2; exit 2; }
done
[[ -f "$TARGET/manifest.json" ]] || { echo "rig-render: no manifest.json" >&2; exit 2; }

MOD="$(jq -r '.id // empty' "$TARGET/manifest.json")"
[[ -n "$MOD" ]] || { echo "rig-render: manifest has no id" >&2; exit 2; }
NAME="${MOD##*.}"
RUN_ID="${NAME}-$$"

fingerprint() {
  ( cd "$TARGET" && find . -type f \
      -not -path './.git/*' -not -path './tests/*' -not -path './scripts/*' \
      -not -path './node_modules/*' -not -path './reports/*' -not -path './coverage/*' \
      \( -name '*.qml' -o -name '*.js' -o -name 'manifest.json' -o -perm -u+x \) \
      -print0 2>/dev/null | LC_ALL=C sort -z | xargs -0 cat 2>/dev/null \
      | sha256sum | cut -d' ' -f1 )
}

FP="$(fingerprint)"
SOURCE_COMMIT="$(git -C "$TARGET" rev-parse HEAD 2>/dev/null || printf unknown)"
SOURCE_DIRTY=false
if [[ "$SOURCE_COMMIT" == unknown ]] || \
   [[ -n "$(git -C "$TARGET" status --porcelain --untracked-files=all -- \
     '*.qml' '*.js' manifest.json preview.png README.md assets/banner.svg \
     scripts/rig-render.sh 2>/dev/null)" ]]; then
  SOURCE_DIRTY=true
fi

TGZ="$(mktemp -t listening-post-render-XXXXXX.tgz)"
REMOTE="$(mktemp -t listening-post-render-XXXXXX.sh)"
trap 'rm -f "$TGZ" "$REMOTE"' EXIT
tar czf "$TGZ" -C "$TARGET" --exclude=.git --exclude=tests --exclude=scripts \
  --exclude=node_modules --exclude=reports --exclude=coverage \
  --exclude=.rig-proof.json --exclude=.render-proof.json --exclude=preview.png . || {
  echo "rig-render: could not package runtime tree" >&2; exit 2; }
ARCHIVE_SHA="$(sha256sum "$TGZ" | cut -d' ' -f1)"

echo "rig-render: shipping $NAME to $HOST/$CONTAINER"
scp -q -o BatchMode=yes "$TGZ" "$HOST:/tmp/rigrender-$RUN_ID.tgz" || {
  echo "rig-render: cannot reach $HOST" >&2; exit 2; }

cat > "$REMOTE" <<REMOTE_EOF
#!/bin/sh
set -eu
MOD="$MOD"; NAME="$NAME"; RUN_ID="$RUN_ID"; RES="$RES"; SCALE="$SCALE"
RUNTIME=/tmp/listening-post-runtime-\$RUN_ID
RIG_ROOT=/tmp/listening-post-home-\$RUN_ID
STATE_ROOT=/tmp/listening-post-state-\$RUN_ID
RIG_BIN=/tmp/listening-post-bin-\$RUN_ID
FIXTURES=/tmp/listening-post-fixtures-\$RUN_ID
SWAY_CONFIG=/tmp/listening-post-sway-\$RUN_ID.conf
SWAY_LOG=/tmp/listening-post-sway-\$RUN_ID.log
QS_LOG=/tmp/listening-post-qs-\$RUN_ID.log
SHOT=/tmp/rigrender-\$RUN_ID.png
PLUGIN_DIR=\$RIG_ROOT/.config/omarchy/plugins/\$NAME
QS_PID=""; SWAY_PID=""
cleanup() {
  [ -z "\$QS_PID" ] || kill "\$QS_PID" 2>/dev/null || true
  [ -z "\$SWAY_PID" ] || kill "\$SWAY_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

for path in "\$RUNTIME" "\$RIG_ROOT" "\$STATE_ROOT" "\$RIG_BIN" "\$FIXTURES"; do
  if [ -d "\$path" ]; then find "\$path" -depth -delete; fi
done
mkdir -p "\$RUNTIME" "\$PLUGIN_DIR" "\$STATE_ROOT/omarchy/listening-post" "\$RIG_BIN" "\$FIXTURES"
chmod 700 "\$RUNTIME" "\$RIG_ROOT" "\$RIG_ROOT/.config" \
  "\$RIG_ROOT/.config/omarchy" "\$RIG_ROOT/.config/omarchy/plugins" \
  "\$PLUGIN_DIR" "\$STATE_ROOT" "\$STATE_ROOT/omarchy" \
  "\$STATE_ROOT/omarchy/listening-post" "\$RIG_BIN" "\$FIXTURES"
tar xzf /tmp/rigrender-\$RUN_ID.tgz -C "\$PLUGIN_DIR"

# Seed one previously-read row so the unchanged first-run rule treats the live
# rig responses as new. The real service still loads and rewrites this record.
NOW_MS=\$((\$(date +%s) * 1000))
jq -n --argjson now "\$NOW_MS" '
  {generatedAt:(\$now - 7200000),firstRun:false,sources:[],items:[{
    guid:"seed:read",sourceId:"seed",vendor:"anthropic",vendorName:"Anthropic",
    product:"",lane:"engineering",quiet:false,title:"Building dependable coding agents",
    url:"https://example.test/agents",timeMs:(\$now - 7200000),resolved:true,read:true,used:true
  }]}' > "\$STATE_ROOT/omarchy/listening-post/state.json"
chmod 600 "\$STATE_ROOT/omarchy/listening-post/state.json"

PUBDATE="\$(date -R)"
cat > "\$FIXTURES/pricing.xml" <<XML
<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>New API pricing and rate limits</title><link>https://openai.com/api/pricing</link>
<guid>pricing-live</guid><pubDate>\$PUBDATE</pubDate></item></channel></rss>
XML
cat > "\$FIXTURES/engineering.xml" <<XML
<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>Inside reliable agent loops</title><link>https://www.anthropic.com/engineering/agent-loops</link>
<guid>engineering-live</guid><pubDate>\$PUBDATE</pubDate></item></channel></rss>
XML
cat > "\$FIXTURES/incident.xml" <<XML
<?xml version="1.0"?><rss version="2.0"><channel><item>
<title>Elevated errors on the Claude API</title><link>https://status.claude.com/incidents/demo</link>
<guid>incident-live</guid><pubDate>\$PUBDATE</pubDate><description>Investigating</description>
</item></channel></rss>
XML
cat > "\$FIXTURES/release.xml" <<XML
<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry>
<title>v2.1.0</title><id>release-live</id><updated>\$(date -u +%Y-%m-%dT%H:%M:%SZ)</updated>
<link rel="alternate" href="https://github.com/anthropics/claude-code/releases/tag/v2.1.0"/>
</entry></feed>
XML

# The rig-only curl boundary validates the production argv and returns a small
# deterministic subset. Production QML and Model.js execute unchanged.
cat > "\$RIG_BIN/curl" <<'SH'
#!/bin/sh
last=""
for arg in "\$@"; do last="\$arg"; done
printf '%s\n' "\$*" >> "\$LISTENING_POST_CURL_LOG"
case "\$last" in
  https://openai.com/news/rss.xml) cat "\$LISTENING_POST_FIXTURES/pricing.xml" ;;
  *feed_anthropic_engineering.xml) cat "\$LISTENING_POST_FIXTURES/engineering.xml" ;;
  https://status.claude.com/history.rss) cat "\$LISTENING_POST_FIXTURES/incident.xml" ;;
  https://github.com/anthropics/claude-code/releases.atom) cat "\$LISTENING_POST_FIXTURES/release.xml" ;;
  *) exit 22 ;;
esac
SH
chmod 700 "\$RIG_BIN/curl"
: > "\$FIXTURES/curl.log"

cat > "\$RIG_ROOT/.config/omarchy/shell.json" <<JSON
{"version":1,"bar":{"position":"top","transparent":false,"centerAnchor":"omarchy.clock",
"layout":{"left":[{"id":"omarchy.workspaces"}],"center":[],
"right":[{"id":"\$MOD","notifications":"Off","personalization":"On"}]}},"plugins":[]}
JSON

cat > "\$SWAY_CONFIG" <<SWAY
output * resolution \$RES scale \$SCALE
seat * hide_cursor 1000
SWAY
export XDG_RUNTIME_DIR="\$RUNTIME"
WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_RENDERER=pixman \
  sway --config "\$SWAY_CONFIG" >"\$SWAY_LOG" 2>&1 &
SWAY_PID=\$!
WAYLAND_SOCKET=""; attempt=0
while [ \$attempt -lt 30 ]; do
  WAYLAND_SOCKET=\$(find "\$RUNTIME" -maxdepth 1 -type s -name 'wayland-*' | head -1)
  [ -z "\$WAYLAND_SOCKET" ] || break
  attempt=\$((attempt + 1)); sleep 1
done
[ -n "\$WAYLAND_SOCKET" ] || { echo "rig-render: isolated Wayland socket did not start" >&2; exit 1; }
export WAYLAND_DISPLAY="\${WAYLAND_SOCKET##*/}"
export SWAYSOCK=\$(find "\$RUNTIME" -maxdepth 1 -type s -name 'sway-ipc.*.sock' | head -1)
[ -n "\$SWAYSOCK" ] || { echo "rig-render: isolated Sway IPC did not start" >&2; exit 1; }

export HOME="\$RIG_ROOT" XDG_STATE_HOME="\$STATE_ROOT" OMARCHY_PATH=/root/omarchy
export PATH="\$RIG_BIN:\$PATH"
export LISTENING_POST_FIXTURES="\$FIXTURES"
export LISTENING_POST_CURL_LOG="\$FIXTURES/curl.log"
qs -p /root/omarchy/shell >"\$QS_LOG" 2>&1 &
QS_PID=\$!

attempt=0
while [ \$attempt -lt 30 ]; do
  STATE="\$STATE_ROOT/omarchy/listening-post/state.json"
  if [ -f "\$STATE" ] && jq -e \
    '(.sources | length) == 29 and
     ([.items[] | select(.lane == "incident" and .resolved == false)] | length) == 1 and
     ([.items[] | select(.lane == "release")] | length) >= 1 and
     ([.items[] | select(.lane == "pricing")] | length) >= 1 and
     ([.items[] | select(.lane == "engineering")] | length) >= 1' \
    "\$STATE" >/dev/null 2>&1; then break; fi
  attempt=\$((attempt + 1)); sleep 1
done
[ \$attempt -lt 30 ] || { echo "rig-render: real service did not complete all four lanes" >&2; tail -80 "\$QS_LOG" >&2; cat "\$STATE" >&2 2>/dev/null || true; exit 1; }
[ "\$(wc -l < "\$FIXTURES/curl.log")" -eq 29 ] || { echo "rig-render: production service did not issue exactly 29 bounded fetches" >&2; exit 1; }
if grep -Ev -- '--proto =https --max-time 12 --max-filesize 2000000 .* -- https://' "\$FIXTURES/curl.log" >/dev/null; then
  echo "rig-render: a production fetch escaped the required argv bounds" >&2; exit 1
fi
[ -d "/proc/\$QS_PID" ] || { echo "rig-render: Quickshell exited before IPC" >&2; exit 1; }

qs -p /root/omarchy/shell ipc call "\$MOD" toggle >/dev/null 2>&1
sleep 8
[ -d "/proc/\$QS_PID" ] || { echo "rig-render: Quickshell exited after IPC" >&2; exit 1; }

echo "===QML WARNINGS==="
grep -a -iE "(WARN|ERROR).*(qml|scene)|(qml|scene).*(WARN|ERROR)|cannot assign|is not a type|unable to|handler was registered|quickshell has crashed" "\$QS_LOG" \
  | grep -avE "libEGL|MESA|ZINK|failed to get driver|failed to create dri2" | head -20
grim "\$SHOT" 2>/dev/null

echo "===ACTION=== poll-complete-panel-opened"
echo "===RUN=== \$RUN_ID"
echo "===LOGSHA=== \$(sha256sum "\$QS_LOG" | awk '{print \$1}')"
echo "===FIXTURESHA=== \$(find "\$FIXTURES" -type f ! -name curl.log -print0 | sort -z | xargs -0 cat | sha256sum | awk '{print \$1}')"
echo "===CURLLOGSHA=== \$(sha256sum "\$FIXTURES/curl.log" | awk '{print \$1}')"
echo "===PACKAGE=== \$(sha256sum /tmp/rigrender-\$RUN_ID.tgz | awk '{print \$1}')"
echo "===SHOT=== \$(ls -l "\$SHOT" | awk '{print \$5}') bytes"
REMOTE_EOF

scp -q -o BatchMode=yes "$REMOTE" "$HOST:/tmp/rigrender-$RUN_ID.sh" || exit 2
set +e
RESULT="$(ssh -o BatchMode=yes "$HOST" "docker cp /tmp/rigrender-$RUN_ID.tgz $CONTAINER:/tmp/ >/dev/null && \
  docker cp /tmp/rigrender-$RUN_ID.sh $CONTAINER:/tmp/ >/dev/null && \
  docker exec $CONTAINER sh /tmp/rigrender-$RUN_ID.sh" 2>&1)"
REMOTE_RC=$?
set -e
if [[ "$REMOTE_RC" -ne 0 ]]; then
  echo "rig-render: remote run failed (exit $REMOTE_RC)" >&2
  printf '%s\n' "$RESULT" >&2
  exit 1
fi

WARNINGS="$(printf '%s' "$RESULT" | sed -n '/===QML WARNINGS===/,/===ACTION===/p' | grep -vE '===' || true)"
SIZE="$(printf '%s' "$RESULT" | grep -oE '===SHOT=== [0-9]+' | grep -oE '[0-9]+' || true)"
REMOTE_SHA="$(printf '%s' "$RESULT" | grep -oE '===PACKAGE=== [a-f0-9]{64}' | awk '{print $2}' || true)"
RAW_LOG_SHA="$(printf '%s' "$RESULT" | grep -oE '===LOGSHA=== [a-f0-9]{64}' | awk '{print $2}' || true)"
FIXTURE_SHA="$(printf '%s' "$RESULT" | grep -oE '===FIXTURESHA=== [a-f0-9]{64}' | awk '{print $2}' || true)"
CURL_LOG_SHA="$(printf '%s' "$RESULT" | grep -oE '===CURLLOGSHA=== [a-f0-9]{64}' | awk '{print $2}' || true)"
REMOTE_RUN_ID="$(printf '%s' "$RESULT" | grep -oE '===RUN=== [a-z0-9-]+' | awk '{print $2}' || true)"
ACTION="$(printf '%s' "$RESULT" | grep -oE '===ACTION=== [a-z0-9-]+' | awk '{print $2}' || true)"

if [[ -n "$WARNINGS" ]]; then
  echo "rig-render: plugin QML warnings:" >&2; printf '%s\n' "$WARNINGS" >&2
fi
if [[ -z "$SIZE" || "$SIZE" -lt 4000 ]]; then
  echo "rig-render: no usable screenshot came back" >&2; printf '%s\n' "$RESULT" >&2; exit 1
fi
[[ "$REMOTE_SHA" == "$ARCHIVE_SHA" ]] || { echo "rig-render: remote package hash mismatch" >&2; exit 1; }
[[ "$RAW_LOG_SHA" =~ ^[a-f0-9]{64}$ && "$FIXTURE_SHA" =~ ^[a-f0-9]{64}$ \
   && "$CURL_LOG_SHA" =~ ^[a-f0-9]{64}$ && "$REMOTE_RUN_ID" == "$RUN_ID" ]] || {
  echo "rig-render: exact run/log provenance missing" >&2; exit 1; }
[[ "$ACTION" == poll-complete-panel-opened ]] || { echo "rig-render: live poll/panel action proof missing" >&2; exit 1; }

ssh -o BatchMode=yes "$HOST" "docker cp $CONTAINER:/tmp/rigrender-$RUN_ID.png /tmp/rigrender-out-$RUN_ID.png >/dev/null" || exit 1
scp -q -o BatchMode=yes "$HOST:/tmp/rigrender-out-$RUN_ID.png" "$OUT" || exit 1

DIMS="$(identify -format '%wx%h' "$OUT" 2>/dev/null || true)"
COVERAGE="$(convert "$OUT" -colorspace gray -threshold 3% -format '%[fx:mean]' info: 2>/dev/null || true)"
[[ "$DIMS" == 1280x720 ]] || { echo "rig-render: expected 1280x720, found $DIMS" >&2; exit 1; }
if [[ -z "$COVERAGE" ]] || ! awk -v coverage="$COVERAGE" 'BEGIN { exit !(coverage >= 0.35) }'; then
  echo "rig-render: nonblack coverage ${COVERAGE:-unreadable} is below 0.35" >&2; exit 1
fi
if [[ -n "$WARNINGS" ]]; then
  echo "rig-render: refusing receipt for warning-bearing shell log" >&2; exit 1
fi

PREVIEW_SHA="$(sha256sum "$OUT" | cut -d' ' -f1)"
jq -n --arg fp "$FP" --arg commit "$SOURCE_COMMIT" --argjson dirty "$SOURCE_DIRTY" \
  --arg archive "$ARCHIVE_SHA" --arg remote "$REMOTE_SHA" --arg rig "$HOST/$CONTAINER" \
  --arg run "$REMOTE_RUN_ID" --arg logSha "$RAW_LOG_SHA" --arg fixtureSha "$FIXTURE_SHA" \
  --arg curlLogSha "$CURL_LOG_SHA" --arg sha "$PREVIEW_SHA" \
  --arg dimensions "${DIMS/x/ x }" --arg coverage "$COVERAGE" --arg scale "$SCALE" \
  --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
  '{fingerprint:$fp,sourceCommit:$commit,sourceDirty:$dirty,
    sourcePackageSha256:$archive,remotePackageSha256:$remote,rig:$rig,runId:$run,
    rawShellLogSha256:$logSha,fixtureSha256:$fixtureSha,curlArgvLogSha256:$curlLogSha,
    packageBoundary:"runtime tree only; receipts, tests, developer scripts, reports, and preview excluded",
    evidenceBoundary:"isolated real Omarchy shell and unchanged Service, Model, bar, and panel under a dedicated headless compositor; deterministic scrubbed RSS and Atom through the unchanged bounded curl boundary; complete production poll; live IPC toggle; direct full-frame grim capture with no crop or image post-processing",
    fixture:"rig-only four-feed response set plus 25 explicit fetch failures; no production fixture branch",
    primaryAction:"live production poll completed and IPC opened all four lanes",
    storyEvidence:{sourceCount:29,laneCount:4,activeIncidentCount:1,releaseCount:1,pricingCount:1,engineeringCount:2,allPrimaryRowsExpected:true},
    outputScale:($scale|tonumber),visualInspection:{status:"pending",previewSha256:$sha,checks:[]},
    previewSha256:$sha,dimensions:$dimensions,nonblackCoverage:($coverage|tonumber),capturedAt:$at}' \
  > "$TARGET/.render-proof.json"

echo "rig-render: wrote $OUT ($DIMS, coverage $COVERAGE)"
echo "rig-render: complete bounded poll, four lanes, and live panel open passed"
