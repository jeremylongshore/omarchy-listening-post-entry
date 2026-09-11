#!/usr/bin/env bash
set -euo pipefail

config_root="${XDG_CONFIG_HOME:-${HOME:?HOME is required}/.config}"
credential_dir="$config_root/perception"
credential_path="$credential_dir/listening-post.curlrc"

if [[ -L "$credential_dir" ]]; then
  printf 'Listening Post: refusing a symlinked credential directory.\n' >&2
  exit 1
fi

install -d -m 700 -- "$credential_dir"
printf 'Paste the one-time Perception device token, then press Enter: ' >&2
IFS= read -r -s device_token
printf '\n' >&2

if [[ ! "$device_token" =~ ^[A-Za-z0-9_-]{32,256}$ ]]; then
  unset device_token
  printf 'Listening Post: that token does not have the expected format.\n' >&2
  exit 1
fi

umask 077
temporary_path="$(mktemp "$credential_dir/.listening-post.curlrc.XXXXXX")"
cleanup() { [[ -z "${temporary_path:-}" ]] || rm -f -- "$temporary_path"; }
trap cleanup EXIT
printf 'header = "Authorization: Bearer %s"\n' "$device_token" > "$temporary_path"
unset device_token
chmod 600 -- "$temporary_path"
mv -f -- "$temporary_path" "$credential_path"
temporary_path=""

printf 'Perception connected. Refresh Listening Post from the bar or press r.\n'
