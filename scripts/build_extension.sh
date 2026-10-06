#!/bin/bash
# Packages the Chrome/Edge extension: copies the shared deer into extension/ and zips it.
# Load it unpacked from the extension/ folder, or upload dist/deer-friend-extension.zip.
set -euo pipefail
cd "$(dirname "$0")/.."

cp web/deer.js extension/deer.js            # single source of truth lives in web/
mkdir -p dist
rm -f dist/deer-friend-extension.zip
(cd extension && zip -qr ../dist/deer-friend-extension.zip . -x '.*')

echo "wrote dist/deer-friend-extension.zip"
echo "To try it: chrome://extensions → Developer mode → Load unpacked → select the extension/ folder"
