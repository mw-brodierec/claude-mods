#!/bin/zsh
# Opens the savvy board: starts the server if it isn't answering, then a small Chrome app window
# in the top-right corner of the main screen. Its own Chrome profile keeps it apart from your
# browser (its own window size, position and dock icon; nothing shared with your tabs).
#   savvy-board/start-board.sh [width] [height]
set -e
dir=${0:A:h}
port=${SAVVY_BOARD_PORT:-7447}
url="http://127.0.0.1:$port"
node=${NODE:-$HOME/.local/bin/node}
profile="$HOME/Library/Application Support/savvy-board/chrome"
chrome="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

if ! curl -s -o /dev/null -m 1 "$url/"; then
  mkdir -p "$HOME/Library/Logs"
  nohup "$node" "$dir/server.mjs" >> "$HOME/Library/Logs/savvy-board.log" 2>&1 &
  for _ in {1..20}; do curl -s -o /dev/null -m 1 "$url/" && break; sleep 0.25; done
fi

if pgrep -qf "user-data-dir=$profile"; then
  echo "The board window is already open."
  exit 0
fi

# The main screen's visible area (menu bar and dock left out), in top-left coordinates.
read sx sy sw sh <<<"$(osascript -l JavaScript -e 'ObjC.import("AppKit"); const s=$.NSScreen.mainScreen, v=s.visibleFrame, f=s.frame; [v.origin.x, f.size.height-v.origin.y-v.size.height, v.size.width, v.size.height].join(" ")')"
w=${1:-420}
h=${2:-$(( sh - 16 < 900 ? sh - 16 : 900 ))}
x=$(( sx + sw - w - 8 ))
y=$(( sy + 8 ))
"$chrome" --user-data-dir="$profile" --no-first-run --no-default-browser-check \
  --app="$url" --window-size="$w,$h" --window-position="$x,$y" >/dev/null 2>&1 &
disown
echo "Board: $url"
