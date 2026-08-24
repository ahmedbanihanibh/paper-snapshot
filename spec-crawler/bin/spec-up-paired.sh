#!/usr/bin/env bash
# Bring up ONE browser that both Claude in Chrome and the crawler can use.
#
#   ~/Documents/paper-snapshot/spec-crawler/bin/spec-up-paired.sh
#
# WHY THIS EXISTS, AND WHY IT IS NOT spec-up.sh
#
# spec-up.sh launches a dedicated profile so the crawler gets a browser nobody
# disturbs. That was right while the crawler drove everything. It is wrong once
# Claude in Chrome is the driver, because a profile cannot see another profile's
# extensions: two browsers, and the agent is looking at a page the crawler
# cannot reach.
#
# THE OBVIOUS FIX DOES NOT WORK, AND FAILS SILENTLY.
#
# The obvious fix is to debug the Default profile, where the extension is already
# installed. Chromium refuses. Since ~136 (Edge 151 here) `--remote-debugging-port`
# is IGNORED when the browser runs on its default user-data-dir — deliberate
# hardening, so that malware cannot attach to your logged-in browser.
#
# It fails in the worst possible way: Edge launches, the flag sits right there in
# `ps`, and nothing ever listens on the port. Measured, same binary, one variable:
#
#   --user-data-dir=<dedicated>  -> port opens
#   Default profile, no flag     -> Edge runs, port never opens
#
# So the profile must be dedicated, and the extension must be installed INTO it.
# That is a one-time manual step this script checks for but cannot perform: an
# extension cannot be installed into a profile from outside the browser.

set -uo pipefail

PORT="${SPEC_CDP_PORT:-9222}"
PROFILE="${SPEC_EDGE_PROFILE:-$HOME/.spec-crawler-edge}"
EDGE="${SPEC_EDGE_BIN:-${EDGE:-/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge}}"
CLAUDE_EXT_ID="fcoeoabgfenejglbffodgkkbkcdhcgfn"
EXT_DIR="$PROFILE/Default/Extensions/$CLAUDE_EXT_ID"
NATIVE_HOST="$HOME/Library/Application Support/Microsoft Edge/NativeMessagingHosts/com.anthropic.claude_code_browser_extension.json"

say() { printf '  %-24s %s\n' "$1" "$2"; }

echo
echo "paired spec environment"
echo "───────────────────────"

# 1. Preconditions worth failing loudly on. Each of these produces a browser that
#    looks fine and silently cannot do the job.
EXT_READY=0
if [ -d "$EXT_DIR" ]; then
  version=$(basename "$(ls -d "$EXT_DIR"/*/ 2>/dev/null | tail -1)")
  say "claude extension" "installed (${version%/}) in the spec profile"
  EXT_READY=1
else
  say "claude extension" "not in the spec profile yet (one-time install below)"
fi

if [ -f "$NATIVE_HOST" ]; then
  say "claude code bridge" "host manifest present"
else
  say "claude code bridge" "MISSING — the extension cannot reach Claude Code"
fi

# 2. The debug port.
#
# An already-running Edge ignores --remote-debugging-port: the new invocation
# just hands the URL to the existing process and exits. The flag only takes
# effect on a cold start, so a half-quit Edge is the single most common reason
# this appears to do nothing.
if curl -s --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
  say "browser" "already listening on ${PORT}"
else
  [ -x "$EDGE" ] || { say "browser" "NOT FOUND at $EDGE"; exit 1; }
  # A dedicated --user-data-dir gets its own process, so a running Edge on the
  # default profile is not a blocker here — unlike the approach this replaces.
  "$EDGE" --remote-debugging-port="${PORT}" --user-data-dir="${PROFILE}" \
    --no-first-run --no-default-browser-check >/dev/null 2>&1 &
  for _ in $(seq 1 40); do
    curl -s --max-time 1 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1 && break
    sleep 0.5
  done
  if curl -s --max-time 2 "http://127.0.0.1:${PORT}/json/version" >/dev/null 2>&1; then
    say "browser" "launched on ${PORT} (profile ${PROFILE})"
  else
    say "browser" "FAILED to come up on ${PORT}"
    echo
    echo "  If Edge is running and the flag is visibly in \`ps\`, the profile is the"
    echo "  cause: Chromium ignores --remote-debugging-port on a default user-data-dir."
    exit 1
  fi
fi

# 3. Confirm the extension is actually live in THIS browser, not merely on disk.
#    A disabled or not-yet-loaded extension has no service worker target.
sleep 1
if curl -s --max-time 3 "http://127.0.0.1:${PORT}/json/list" | grep -q "$CLAUDE_EXT_ID"; then
  say "extension target" "service worker is live on ${PORT}"
  EXT_READY=1
elif [ "$EXT_READY" = "1" ]; then
  say "extension target" "installed but asleep — open the Claude side panel once"
fi

echo
if [ "$EXT_READY" != "1" ]; then
  echo "  ONE-TIME SETUP — install Claude in Chrome into this profile:"
  echo
  echo "    In the window that just opened, go to the Edge Add-ons / Chrome Web"
  echo "    Store page for Claude and install it, then sign in. This profile is"
  echo "    persistent (${PROFILE}), so it is genuinely one-time."
  echo
  echo "    It cannot be scripted: extensions install through the browser UI, and"
  echo "    copying the signed extension directory across profiles breaks its"
  echo "    integrity check."
  echo
fi
echo "  Once installed, both halves share one browser: Claude in Chrome drives the"
echo "  tab, spec-crawler attaches to the same tab over CDP on ${PORT}."
echo
echo "  Known conflict: chrome.debugger (which the extension holds) and a raw CDP"
echo "  session can contend for one target. If a capture fails with a detach"
echo "  error, it is this — not the page. Capture between agent actions, not"
echo "  during one."
echo
