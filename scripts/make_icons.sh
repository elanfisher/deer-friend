#!/bin/bash
# Regenerates every icon from the fawn sprites in Resources/:
#   AppIcon.icns          the Mac app icon
#   AppIcon-1024.png      the source it's built from (also used by the website/readme)
#   deer.ico              the Windows app icon
#   extension/icons/*.png the Chrome extension icons
# Run it after changing how she looks: ./scripts/make_icons.sh
set -euo pipefail
cd "$(dirname "$0")/.."

SPRITE=Resources/DeerFront.png
BIG=Resources/AppIcon-1024.png

swift scripts/make_app_icon.swift "$SPRITE" "$BIG" 1024

# ── macOS .icns ──
ICONSET=$(mktemp -d)/AppIcon.iconset
mkdir -p "$ICONSET"
for size in 16 32 64 128 256 512; do
  sips -Z "$size" "$BIG" --out "$ICONSET/icon_${size}x${size}.png" >/dev/null
  sips -Z $((size * 2)) "$BIG" --out "$ICONSET/icon_${size}x${size}@2x.png" >/dev/null
done
cp "$BIG" "$ICONSET/icon_512x512@2x.png"
iconutil -c icns "$ICONSET" -o Resources/AppIcon.icns
echo "wrote Resources/AppIcon.icns"

# ── Chrome extension icons ──
mkdir -p extension/icons
for size in 16 32 48 128; do
  sips -Z "$size" "$BIG" --out "extension/icons/icon${size}.png" >/dev/null
done
echo "wrote extension/icons/icon{16,32,48,128}.png"

# ── Windows .ico (PNG-compressed frames, which Windows Vista+ reads) ──
TMP=$(mktemp -d)
for size in 16 24 32 48 64 128 256; do
  sips -Z "$size" "$BIG" --out "$TMP/$size.png" >/dev/null
done
python3 - "$TMP" Resources/deer.ico <<'PY'
import struct, sys, pathlib
tmp, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
sizes = [16, 24, 32, 48, 64, 128, 256]
blobs = [(s, (tmp / f"{s}.png").read_bytes()) for s in sizes]
header = struct.pack("<HHH", 0, 1, len(blobs))          # reserved, type=icon, count
offset = 6 + 16 * len(blobs)
entries, data = b"", b""
for size, blob in blobs:
    entries += struct.pack("<BBBBHHII", size % 256, size % 256, 0, 0, 1, 32, len(blob), offset)
    data += blob
    offset += len(blob)
out.write_bytes(header + entries + data)
print(f"wrote {out} ({len(blobs)} sizes)")
PY
