#!/bin/zsh
# Keeps the board's server running across logins with a user LaunchAgent (no sudo). The plist is
# written from this machine's paths at install time, so the repository holds none.
#   savvy-board/install-agent.sh            write the LaunchAgent and start it
#   savvy-board/install-agent.sh --remove   stop it and delete it
set -e
dir=${0:A:h}
label=com.marc-mods.savvy-board
plist="$HOME/Library/LaunchAgents/$label.plist"
node=${NODE:-$(for n in $HOME/.local/bin/node /opt/homebrew/bin/node /usr/local/bin/node $(command -v node); do [[ -x $n ]] && { echo $n; break }; done)}

if [[ $1 == --remove ]]; then
  launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
  rm -f "$plist"
  echo "Removed $plist"
  exit 0
fi

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$label</string>
  <key>ProgramArguments</key><array><string>$node</string><string>$dir/server.mjs</string></array>
  <key>WorkingDirectory</key><string>$dir</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/savvy-board.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/savvy-board.log</string>
</dict>
</plist>
PLIST
# A server started by hand holds the port; let the agent own it.
pkill -f "$dir/server.mjs" 2>/dev/null || true
launchctl bootout "gui/$(id -u)/$label" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$plist"
echo "Loaded $label: the server now starts at login and restarts if it stops."
