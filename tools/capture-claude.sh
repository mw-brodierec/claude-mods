#!/bin/zsh
# Marc: the UI check for mods. Screenshots the Claude desktop app's main window as it really draws
# a mod's band and panes (headless renders only cover a mod's SVGs, never the app's own buttons,
# links and layout). Works with the window behind others. Needs Screen Recording permission.
#   tools/capture-claude.sh <out.png>
set -e
out=${1:-/tmp/claude-window.png}
id=$(swift - <<'SWIFT'
import CoreGraphics
let list = CGWindowListCopyWindowInfo([.optionAll, .excludeDesktopElements], kCGNullWindowID) as! [[String: Any]]
var best = (0, 0.0)
for w in list where (w[kCGWindowOwnerName as String] as? String) == "Claude" && (w[kCGWindowLayer as String] as? Int) == 0 {
  let b = w[kCGWindowBounds as String] as? [String: Any] ?? [:]
  let area = (b["Width"] as? Double ?? 0) * (b["Height"] as? Double ?? 0)
  if area > best.1 { best = (w[kCGWindowNumber as String] as? Int ?? 0, area) }
}
print(best.0)
SWIFT
)
screencapture -x -o -l"$id" "$out"
echo "$out"
