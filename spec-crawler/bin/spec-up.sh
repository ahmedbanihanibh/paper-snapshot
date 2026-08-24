#!/usr/bin/env bash
# Bring the spec environment back up after a restart.
#
#   ~/Documents/paper-snapshot/spec-crawler/bin/spec-up.sh
#
# Everything the capture toolchain needs lives outside the Claude sessions:
# a debug browser holding real logins, and the dev servers the candidate side
# is measured against. Sessions are disposable; this is not.
#
# The profile directory is the important part. Edge keeps cookies there, so
# relaunching with the same --user-data-dir means Linear and protocolbase stay
# signed in across reboots. Launching without it opens a clean profile, every
# capture hits a login wall, and the failure looks like a broken crawler.

set -uo pipefail

PROFILE="${SPEC_EDGE_PROFILE:-$HOME/.spec-crawler-edge}"
PORT="${SPEC_CDP_PORT:-9222}"
EDGE="${SPEC_EDGE_BIN:-${EDGE:-/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge}}"
LINEAR_URL="${SPEC_LINEAR_URL:-https://linear.app/test-workspace-bb/team/TES/all}"
APP_URL="${SPEC_APP_URL:-http://localhost:3000}"

say() { printf '  %-22s %s\n' "$1" "$2"; }

echo
echo "spec environment"
echo "────────────────"

# 1. Debug browser
if curl -s --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  say "browser" "already listening on ${PORT}"
else
  if [ ! -x "$EDGE" ]; then
    say "browser" "NOT FOUND at $EDGE"
    echo
    echo "  Edge is not installed at the expected path. Point EDGE= at your browser"
    echo "  binary, or launch it yourself with:"
    echo "    --remote-debugging-port=${PORT} --user-data-dir=${PROFILE}"
    exit 1
  fi
  "$EDGE" --remote-debugging-port="${PORT}" --user-data-dir="${PROFILE}" \
    --no-first-run --no-default-browser-check >/dev/null 2>&1 &
  for _ in $(seq 1 40); do
    curl -s --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1 && break
    sleep 0.5
  done
  if curl -s --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    say "browser" "launched (profile ${PROFILE})"
  else
    say "browser" "FAILED to come up on ${PORT}"
    exit 1
  fi
fi

# 2. Reference and candidate tabs.
#
# Opened through the debug endpoint rather than `open`, so they land in this
# profile rather than whichever browser macOS considers default.
open_tab() {
  local url="$1" name="$2"
  if curl -s --max-time 3 "http://127.0.0.1:${PORT}/json/list" | grep -q "${3}"; then
    say "$name" "tab already open"
  else
    curl -s --max-time 5 -X PUT "http://127.0.0.1:${PORT}/json/new?${url}" >/dev/null 2>&1 \
      || curl -s --max-time 5 "http://127.0.0.1:${PORT}/json/new?${url}" >/dev/null 2>&1
    say "$name" "opened ${url}"
  fi
}
open_tab "$LINEAR_URL" "linear (reference)" "linear.app"
open_tab "$APP_URL"    "protocolbase (candidate)" "localhost:3000"

# 3. Candidate dev server. Reported, never started — starting someone else's
#    dev server from a helper script hides which process owns the port.
#
#    The timeout is generous on purpose: a cold Next dev server takes several
#    seconds to answer its first request. A 2s limit reported it DOWN while it
#    was serving 200s, which is worse than no check at all.
if curl -s --max-time 15 -o /dev/null "$APP_URL" 2>/dev/null; then
  say "app dev server" "up on ${APP_URL}"
elif lsof -ti:"${APP_URL##*:}" >/dev/null 2>&1; then
  say "app dev server" "listening but slow to answer — probably still compiling"
else
  say "app dev server" "DOWN — start it in the protocolbase repo"
fi

# 4. Sign-in check. A tab that redirected to a login page is the single most
#    common reason a capture returns nothing, and it is silent otherwise.
sleep 1
LOGGED_OUT=$(curl -s --max-time 3 "http://127.0.0.1:${PORT}/json/list" \
  | grep -o '"url": "[^"]*"' | grep -Ei 'login|signin|sign-in' | head -3)
if [ -n "$LOGGED_OUT" ]; then
  echo
  echo "  ⚠ a tab is sitting on a login page — sign in manually before capturing:"
  echo "$LOGGED_OUT" | sed 's/^/      /'
fi

echo
echo "  Next: open one Claude session per repo. Each repo's CLAUDE.md assigns its"
echo "  role and loads the spec-protocol skill; run ListAgents to find the other."
echo
