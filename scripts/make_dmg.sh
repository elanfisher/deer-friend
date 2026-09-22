#!/bin/bash
# Builds DeerFriend.app and wraps it in a drag-to-Applications disk image:
#   dist/DeerFriend-mac.dmg
set -euo pipefail
cd "$(dirname "$0")/.."

./build_app.sh

STAGE=$(mktemp -d)/Deer\ Friend
mkdir -p "$STAGE"
cp -R DeerFriend.app "$STAGE/"
ln -s /Applications "$STAGE/Applications"          # the usual drag-here target
cp README.md "$STAGE/Read Me.md"

mkdir -p dist
rm -f dist/DeerFriend-mac.dmg
hdiutil create -volname "Deer Friend" -srcfolder "$STAGE" -ov -format UDZO -quiet dist/DeerFriend-mac.dmg
shasum -a 256 dist/DeerFriend-mac.dmg | tee dist/DeerFriend-mac.dmg.sha256

echo "wrote dist/DeerFriend-mac.dmg"
