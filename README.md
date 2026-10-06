# Deer Friend 🦌

A little pixel-art white-tailed fawn who lives on your Mac desktop. She wanders along the bottom
of your screen (or on top of any window), grazes, chews, plays, naps, watches your cursor, and
lets you pet and feed her. Turn on Friend Mode and she gets a companion to play, run around and
nap with.

She isn't a sprite sheet: she's a small procedural rig (torso, neck, head, ears, jointed legs,
tail) drawn onto a tiny canvas each frame, snapped to a palette and outlined, so every animation
is just joint angles over time.

## Download

| | Link | Notes |
| --- | --- | --- |
| **Mac** (13+) | [DeerFriend-mac.dmg](https://github.com/elanfisher/deer-friend/releases/latest/download/DeerFriend-mac.dmg) | Drag her into Applications. She lives in the menu bar. |
| **Windows** (10/11) | [DeerFriendSetup.exe](https://github.com/elanfisher/deer-friend/releases/latest/download/DeerFriendSetup.exe) | She lives in the notification area. |
| **Chrome / Edge** | [deer-friend-extension.zip](https://github.com/elanfisher/deer-friend/releases/latest/download/deer-friend-extension.zip) | She wanders along the bottom of web pages. |

**New to this? Follow [INSTALL.md](INSTALL.md) or the [download page](https://elanfisher.github.io/deer-friend/),
which detects your platform and walks you through it step by step.**

Neither app is signed by Apple or Microsoft yet, so each shows one first-run warning:
on **Mac**, open System Settings → Privacy & Security and click **Open Anyway**;
on **Windows**, click **More info → Run anyway**. For the extension: unzip it, then
`chrome://extensions` → **Developer mode** → **Load unpacked** → pick the folder.

Every download is built by GitHub Actions from this repo, virus-scanned with ClamAV, and
published with a SHA-256 checksum and a signed build-provenance attestation
(`gh attestation verify <file> --repo elanfisher/deer-friend`).

To publish a new release: `git tag v1.0.0 && git push origin v1.0.0`.

## Build it yourself

```bash
./build_app.sh                 # Mac app          → DeerFriend.app
./scripts/make_dmg.sh          # Mac disk image   → dist/DeerFriend-mac.dmg
./scripts/build_extension.sh   # Chrome extension → dist/deer-friend-extension.zip
./scripts/make_icons.sh        # regenerate every icon from her own sprite
cd windows && dotnet build     # Windows app (works from any OS)
```

The Mac app needs macOS 13+ and the Xcode command-line tools (`xcode-select --install`);
the Windows app needs .NET 8. To keep her around, turn on **Launch at Login** (Mac) or
**Start with Windows** in her menu.

## Using her (Mac)

Everything lives in her menu: click the little deer in your menu bar.

| Menu item | What it does |
| --- | --- |
| Hide Deer / Show Deer | Tucks her away (and stops animating) until you bring her back |
| Friend Mode | A second fawn: they play, run around, nap side by side, ignore each other — and she leapfrogs over her friend |
| Grass Patches to Rest On | Now and then she hops onto a patch of grass that grows in under her; she grazes, lies down or naps there, and it fades away when she hops off |
| Auto Mode (Ignore Cursor) | She lives her life and pays no attention to the cursor |
| Watch the Cursor | Her head follows the cursor, even swivelling back over her shoulder |
| Follow the Cursor | She walks or runs to stay by the cursor — and hops across to whichever window it's over |
| Move Out of the Way When Hovered | She fades see-through and trots aside when the cursor lands on her |
| Live On | **Whole Screen** (she hops between the tops of your windows, riding along when you drag one), the bottom of the screen, or perched on one window |
| Show in Front of Windows | Off: other windows can cover her (only for Bottom of Screen / one window) |
| Display / Size | Which screen, and Small / Medium / Large |
| Launch at Login | Start her automatically when you log in |

Her window is click-through, so she never gets in the way of your clicks.

- **Petting and feeding:** move the cursor slowly up to her and she gets curious; hover near her
  to pet her, or hold the mouse button down by her mouth to feed her a clover.
- **Hearts** float up when your cursor is close, and when the two fawns are snuggled together.
- **Waking her:** wave the cursor back and forth over a sleeping fawn and she'll get up and look
  at you (not in Auto Mode).
- **Window hopping** needs some room above a window: maximised windows tucked right under the
  menu bar have no top edge for her to stand on.

## Browser prototype + Design Lab

The whole deer lives in one file, [`web/index.html`](web/index.html). Open it in a browser for a
meadow to play in, keyboard controls, and the **🎨 Design Lab**, which has 10 numbered variants
for each body part (body, legs, neck, head, face, ears, tail) with a live preview. Picks are saved
in the browser; the Mac app uses `DEFAULT_SEL` in `web/index.html`, so copy the lab's code there
and rebuild to change her look on the desktop.

```bash
python3 -m http.server 8742 --directory web
open http://localhost:8742          # add ?desktop to preview the transparent desktop mode
```

Keys: arrows/WASD walk (Shift runs), Space jump, E eat, C chew, V chew+look, L look, G stare,
Z sleep, R rest, P play, T toggles auto mode.

## How it fits together

- `web/index.html` holds the rig, animations, behavior (state machine, friend "director", cursor
  reactions) and rendering. In desktop mode it has a transparent background and no UI, and it runs
  on an adaptive timer (24 fps moving / 12 fps idle / 8 fps asleep) to stay light on CPU.
- `Sources/DeerFriend/AppDelegate.swift` puts that page in a transparent, click-through
  `WKWebView` window, polls the real cursor and passes it in, and handles placement (screen strip
  or perched on a window), hiding, and launch at login.
- `Sources/DeerFriend/StatusBarController.swift` is the 🦌 menu.
- `Sources/DeerFriend/WindowTracker.swift` reads window positions for perching.
- `build_app.sh` compiles, bundles the page into the app, and ad-hoc signs it.

See [SECURITY.md](SECURITY.md) for what the app can and can't access.
