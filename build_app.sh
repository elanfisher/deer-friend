#!/bin/bash
# Builds DeerFriend in release mode and packages it as DeerFriend.app.
set -euo pipefail
cd "$(dirname "$0")"

CONFIG="release"
swift build -c "$CONFIG"

BIN_PATH="$(swift build -c "$CONFIG" --show-bin-path)"
APP="DeerFriend.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN_PATH/DeerFriend" "$APP/Contents/MacOS/DeerFriend"
cp "Resources/Info.plist" "$APP/Contents/Info.plist"
mkdir -p "$APP/Contents/Resources/web"
cp web/index.html "$APP/Contents/Resources/web/index.html"

echo "Built $APP"
echo "Run it with:  open \"$APP\""
