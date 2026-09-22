#!/bin/bash
# Refreshes the download page's copies of the shared files (docs/ is served by GitHub Pages,
# which can only see files inside that folder).
set -euo pipefail
cd "$(dirname "$0")/.."

cp web/deer.js docs/deer.js
sips -Z 256 Resources/AppIcon-1024.png --out docs/icon.png >/dev/null

echo "refreshed docs/deer.js and docs/icon.png"
