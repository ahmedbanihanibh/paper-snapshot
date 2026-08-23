#!/usr/bin/env bash
# Start the spec session: environment up, then Claude in the right repo.
#
#   spec-session.sh              start it here, in this terminal
#   spec-session.sh --window     open a new Terminal window and start it there
#   spec-session.sh --resume     resume the most recent session in this repo
#
# The repo matters as much as the environment. Claude Code loads CLAUDE.md from
# the working directory, and the spec role lives in paper-snapshot's — start
# anywhere else and the session has the tools but not the brief.

set -uo pipefail

REPO="${SPEC_REPO:-$HOME/Documents/paper-snapshot}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# claude is installed under nvm, so it is absent from the PATH of anything not
# launched from an interactive shell — a LaunchAgent, an editor task, Spotlight.
# Resolve it properly rather than assuming the caller has nvm loaded.
find_claude() {
  command -v claude 2>/dev/null && return 0
  for candidate in \
    "$HOME"/.nvm/versions/node/*/bin/claude \
    "$HOME"/.local/bin/claude \
    /usr/local/bin/claude \
    /opt/homebrew/bin/claude
  do
    [ -x "$candidate" ] && { echo "$candidate"; return 0; }
  done
  return 1
}

CLAUDE_BIN="$(find_claude)" || {
  echo "spec-session: cannot find the claude CLI." >&2
  echo "  Install it, or set CLAUDE_BIN to its path." >&2
  exit 1
}
CLAUDE_BIN="${CLAUDE_BIN_OVERRIDE:-$CLAUDE_BIN}"

MODE="start"
for arg in "$@"; do
  case "$arg" in
    --window) MODE="window" ;;
    --resume) MODE="resume" ;;
    -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "spec-session: unknown option $arg" >&2; exit 2 ;;
  esac
done

if [ ! -d "$REPO" ]; then
  echo "spec-session: no repo at $REPO — set SPEC_REPO." >&2
  exit 1
fi

if [ "$MODE" = "window" ]; then
  # Re-enter this script inside a fresh Terminal window. Claude Code is
  # interactive, so it needs a tty of its own; backgrounding it does nothing useful.
  osascript >/dev/null <<OSA
tell application "Terminal"
  activate
  do script "'${HERE}/spec-session.sh'"
end tell
OSA
  echo "spec session opening in a new Terminal window."
  exit 0
fi

"${HERE}/spec-up.sh" || exit 1

cd "$REPO" || exit 1
echo "  repo                   $REPO"
echo "  role                   from ./CLAUDE.md (spec session)"
echo
echo "  Once inside: ListAgents to find the builder session."
echo

if [ "$MODE" = "resume" ]; then
  exec "$CLAUDE_BIN" --resume
fi
exec "$CLAUDE_BIN"
