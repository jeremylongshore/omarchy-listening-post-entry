#!/usr/bin/env bash
set -euo pipefail
set +x

script_dir="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
secure_state="$script_dir/bin/listening-post-secure-state"
[[ -x "$secure_state" ]] || { printf 'Listening Post: secure-state helper is unavailable.\n' >&2; exit 1; }
printf 'Paste the one-time Perception pairing code, then press Enter: ' >&2
IFS= read -r -s pairing_code
printf '\n' >&2

if [[ ! "$pairing_code" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  unset pairing_code
  printf 'Listening Post: that pairing code does not have the expected format.\n' >&2
  exit 1
fi

response="$(printf '{"code":"%s"}' "$pairing_code" | curl --silent --show-error --fail-with-body --max-time 15 \
  --request POST --header 'Content-Type: application/json' --data-binary @- \
  'https://api.perception.intentsolutions.io/v1/pairing/exchange')"
unset pairing_code
device_token="$(printf '%s' "$response" | jq -er '.token | select(type == "string" and test("^[A-Za-z0-9_-]{32,256}$"))')"
unset response
printf '%s\n' "$device_token" | "$secure_state" --write
unset device_token

printf 'Perception connected. Refresh Listening Post from the bar or press r.\n'
