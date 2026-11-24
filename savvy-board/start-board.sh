#!/bin/zsh
# Opens the savvy board: starts the server if it isn't answering, then the Savvy Flow app
# (~/Applications/Savvy Flow.app, built from app/ on first use): one Dock tile with Clawd, no Chrome.
# Run again while the window is open, it brings the window to the front (macOS keeps one copy). The savvy-progress band's
# 🔍 and ↻ run this too (the board's server says where in ~/.claude/savvy-progress/board.json).
#   savvy-board/start-board.sh [--refresh]
#   --refresh   also makes the board read every session again now
set -e
refresh=0
[[ $1 == --refresh ]] && { refresh=1; shift }
dir=${0:A:h}
port=${SAVVY_BOARD_PORT:-7447}
url="http://127.0.0.1:$port"
node=${NODE:-$HOME/.local/bin/node}

if ! curl -s -o /dev/null -m 1 "$url/"; then
  mkdir -p "$HOME/Library/Logs"
  # Its own session (setsid), so it outlives whatever ran this script, a mod's button included.
  # The LaunchAgent (install-agent.sh) is the steadier way to keep it up.
  nohup /usr/bin/perl -MPOSIX -e 'POSIX::setsid(); exec @ARGV' "$node" "$dir/server.mjs" >> "$HOME/Library/Logs/savvy-board.log" 2>&1 &
  for _ in {1..20}; do curl -s -o /dev/null -m 1 "$url/" && break; sleep 0.25; done
fi
(( refresh )) && curl -s -o /dev/null -m 2 -X POST -H "Origin: $url" "$url/refresh"

app="$HOME/Applications/Savvy Flow.app"
[[ -d $app ]] || "$dir/app/build-app.sh" >/dev/null
open -a "$app"
echo "Board: $url"
