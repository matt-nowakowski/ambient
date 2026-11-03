#!/bin/sh
# Compiles src-tauri/icons/Assets.car (the asset-catalog app icon, AppIcon)
# from src-tauri/icons/icon.icns. macOS 26 prefers an asset-catalog icon named
# by CFBundleIconName; the bundler copies this Assets.car into the app and sets
# CFBundleIconName from it, keeping icon.icns as the CFBundleIconFile fallback.
# Committed pre-built so release runners don't depend on their Xcode version.
#   sh brand/build-assets-car.sh   (from the repo root, after generate-icons)
set -eu
root=$(pwd)
icns="$root/src-tauri/icons/icon.icns"
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT

iconutil -c iconset -o "$work/icon.iconset" "$icns"
set_dir="$work/Assets.xcassets/AppIcon.appiconset"
mkdir -p "$set_dir"
cp "$work/icon.iconset/"*.png "$set_dir/"
cat >"$work/Assets.xcassets/Contents.json" <<'EOF'
{ "info" : { "author" : "xcode", "version" : 1 } }
EOF
images=""
for base in 16 32 128 256 512; do
  for scale in 1 2; do
    if [ "$scale" = 1 ]; then f="icon_${base}x${base}.png"; else f="icon_${base}x${base}@2x.png"; fi
    entry="{ \"filename\" : \"$f\", \"idiom\" : \"mac\", \"scale\" : \"${scale}x\", \"size\" : \"${base}x${base}\" }"
    if [ -z "$images" ]; then images="$entry"; else images="$images, $entry"; fi
  done
done
cat >"$set_dir/Contents.json" <<EOF
{ "images" : [ $images ], "info" : { "author" : "xcode", "version" : 1 } }
EOF

mkdir -p "$work/out"
xcrun actool "$work/Assets.xcassets" \
  --compile "$work/out" \
  --platform macosx \
  --minimum-deployment-target 10.15 \
  --app-icon AppIcon \
  --output-partial-info-plist "$work/partial.plist" \
  --output-format human-readable-text --notices --warnings >/dev/null
cp "$work/out/Assets.car" "$root/src-tauri/icons/Assets.car"
echo "wrote src-tauri/icons/Assets.car"
