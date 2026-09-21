# Deer Friend 🦌

A little pixel-art white-tailed fawn who lives on your Mac desktop. She wanders along the bottom
of your screen (or on top of any window), grazes, chews, plays, naps, watches your cursor, and
lets you pet and feed her. Turn on Friend Mode and she gets a companion to play, run around and
nap with.

She isn't a sprite sheet: she's a small procedural rig (torso, neck, head, ears, jointed legs,
tail) drawn onto a tiny canvas each frame, snapped to a palette and outlined, so every animation
is just joint angles over time.

## Run her on your Mac

```bash
./build_app.sh
open DeerFriend.app
```

Requires macOS 13+ and the Xcode command-line tools (`xcode-select --install`). To keep her
around, move `DeerFriend.app` into `/Applications`, then turn on **Launch at Login** in her menu.

Everything is controlled from the 🦌 in the menu bar:

| Menu item | What it does |
| --- | --- |
| Hide Deer / Show Deer | Tucks her away (and stops animating) until you bring her back |
| Friend Mode | Adds a second fawn: they play together, run around, nap side by side, or ignore each other |
| Auto Mode (Ignore Cursor) | She just lives her life and pays no attention to the cursor |
| Watch the Cursor | Her head follows the cursor, even swivelling back over her shoulder |
| Follow the Cursor | She walks (or runs) to stay next to the cursor |
| Live On | Bottom of the screen, or perched on top of any window (she rides along when you move it) |
| Display / Size | Which screen, and Small / Medium / Large |
| Launch at Login | Start her automatically when you log in |

Her window is click-through, so she never gets in the way of your clicks.

**Petting and feeding:** move the cursor slowly up to her and she gets curious; hover near her
to pet her (hearts), or hold the mouse button down by her mouth to feed her a clover.

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
