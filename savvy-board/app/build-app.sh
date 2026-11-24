#!/bin/zsh
# Builds ~/Applications/Savvy Flow.app from SavvyFlow.swift and icon.svg (no Xcode project; needs the
# Command Line Tools' swiftc). The bundle is a build output: it isn't committed.
#   savvy-board/app/build-app.sh
set -e
dir=${0:A:h}
app="$HOME/Applications/Savvy Flow.app"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

swiftc -O -o "$tmp/SavvyFlow" "$dir/SavvyFlow.swift"

# icon.svg → .icns. Headless Chrome only draws it (a background process, no Dock tile).
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --user-data-dir="$tmp/chrome" \
  --disable-gpu --hide-scrollbars --default-background-color=00000000 --window-size=1024,1024 \
  --screenshot="$tmp/icon.png" "file://$dir/icon.svg" >/dev/null 2>&1
mkdir "$tmp/AppIcon.iconset"
for s in 16 32 128 256 512; do
  sips -z $s $s "$tmp/icon.png" --out "$tmp/AppIcon.iconset/icon_${s}x${s}.png" >/dev/null
  sips -z $((s * 2)) $((s * 2)) "$tmp/icon.png" --out "$tmp/AppIcon.iconset/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns -o "$tmp/AppIcon.icns" "$tmp/AppIcon.iconset"

rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources"
cp "$tmp/SavvyFlow" "$app/Contents/MacOS/SavvyFlow"
cp "$tmp/AppIcon.icns" "$app/Contents/Resources/AppIcon.icns"
cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>CFBundleName</key><string>Savvy Flow</string>
  <key>CFBundleDisplayName</key><string>Savvy Flow</string>
  <key>CFBundleIdentifier</key><string>com.marc-mods.savvy-flow</string>
  <key>CFBundleExecutable</key><string>SavvyFlow</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>1.0</string>
  <key>LSMinimumSystemVersion</key><string>13.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
codesign --force --sign - "$app" >/dev/null 2>&1
# Make Finder and the Dock pick up the new icon.
touch "$app"
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$app"
echo "Built: $app"
