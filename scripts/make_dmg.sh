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
cat > "$STAGE/Read Me First.txt" <<'EOF'
Deer Friend — a little fawn for your desktop
============================================

1. Drag the deer app onto the Applications folder in this window.

2. Open your Applications folder and double-click DeerFriend.

3. The first time, macOS will say it "cannot verify the developer".
   That is expected: this app isn't signed with a paid Apple certificate.
   Click Done, then open:

       System Settings  ->  Privacy & Security

   Scroll down until you see a line mentioning DeerFriend and click
   "Open Anyway". You only have to do this once.

   (On macOS 14 and earlier: right-click the app and choose Open instead.)

4. She appears at the bottom of your screen, and a small deer icon
   appears in your menu bar at the top right. Click it for her menu:
   size, friend mode, which display she lives on, hiding her, and
   starting her automatically when you log in.

Playing with her
----------------
Move slowly toward her and she'll watch your cursor. Hover near her to
pet her. Hold the mouse button down by her mouth to feed her a clover.
She never blocks your clicks — you can click straight through her.

To remove her: quit from her menu bar icon and drag the app to the Trash.

Source, updates and help: https://github.com/elanfisher/deer-friend
EOF

mkdir -p dist
rm -f dist/DeerFriend-mac.dmg
hdiutil create -volname "Deer Friend" -srcfolder "$STAGE" -ov -format UDZO -quiet dist/DeerFriend-mac.dmg
shasum -a 256 dist/DeerFriend-mac.dmg | tee dist/DeerFriend-mac.dmg.sha256

echo "wrote dist/DeerFriend-mac.dmg"
