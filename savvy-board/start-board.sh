#!/bin/zsh
# Opens the savvy board: starts the server if it isn't answering, then a small Chrome app window
# in the top-right corner of the main screen. Its own Chrome profile keeps it apart from your
# browser (its own window size, position and dock icon; nothing shared with your tabs).
# Run again while the window is open, it brings the window to the front. The savvy-progress band's
# 🔍 and ↻ run this too (the board's server says where in ~/.claude/savvy-progress/board.json).
#   savvy-board/start-board.sh [--refresh] [width] [height]
#   --refresh   also makes the board read every session again now
set -e
refresh=0
[[ $1 == --refresh ]] && { refresh=1; shift }
dir=${0:A:h}
port=${SAVVY_BOARD_PORT:-7447}
url="http://127.0.0.1:$port"
node=${NODE:-$HOME/.local/bin/node}
profile="$HOME/Library/Application Support/savvy-board/chrome"

if ! curl -s -o /dev/null -m 1 "$url/"; then
  mkdir -p "$HOME/Library/Logs"
  # Its own session (setsid), so it outlives whatever ran this script, a mod's button included.
  # The LaunchAgent (install-agent.sh) is the steadier way to keep it up.
  nohup /usr/bin/perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' "$node" "$dir/server.mjs" >> "$HOME/Library/Logs/savvy-board.log" 2>&1 &
  for _ in {1..20}; do curl -s -o /dev/null -m 1 "$url/" && break; sleep 0.25; done
fi
(( refresh )) && curl -s -o /dev/null -m 2 -X POST -H "Origin: $url" "$url/refresh"

if pid=$(pgrep -f "user-data-dir=$profile" | head -1) && [[ -n $pid ]]; then
  osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $pid) to true" >/dev/null 2>&1 || true
  echo "Board window brought to the front."
  exit 0
fi

# The main screen's visible area (menu bar and dock left out), in top-left coordinates.
read sx sy sw sh <<<"$(osascript -l JavaScript -e 'ObjC.import("AppKit"); const s=$.NSScreen.mainScreen, v=s.visibleFrame, f=s.frame; [v.origin.x, f.size.height-v.origin.y-v.size.height, v.size.width, v.size.height].join(" ")')"
w=${1:-420}
h=${2:-$(( sh - 16 < 900 ? sh - 16 : 900 ))}
x=$(( sx + sw - w - 8 ))
y=$(( sy + 8 ))
# A new Chrome instance through Launch Services, detached from this script.
open -na "Google Chrome" --args --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --app="$url" --window-size="$w,$h" --window-position="$x,$y"
echo "Board: $url"
