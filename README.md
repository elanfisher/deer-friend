# Deer Friend 🦌

A little pixel-art white-tailed doe that hangs around on your Mac desktop —
inspired by Anthropic's mascot deer. She's not a sprite sheet; she's a tiny
procedural rig (body / neck / head / ears / 4 legs / tail) rendered onto a
low-res canvas each frame and scaled up with nearest-neighbor filtering, so
every animation is just joint angles over time instead of hand-painted frames.

She lives in a small, click-through, transparent, always-on-top window that
repositions itself to follow her as she roams — she never blocks clicks on
your desktop or other apps, and she's not a real window you can accidentally
close.

## Running her

```bash
./build_app.sh
open DeerFriend.app
```

She has no Dock icon or menu — just a 🦌 in your menu bar with:
- **Show Debug Info** — small HUD over her showing current state / cursor distance / cursor speed / trust
- **Reset Trust** — reset how "tame" she's gotten
- **Quit Deer Friend**

To stop her without the menu: `pkill -f DeerFriend.app`

## How she reacts to your cursor

No accessibility/screen-recording permissions needed — she just polls
`NSEvent.mouseLocation` (your cursor's on-screen position), which is a plain
Cocoa read, not an event tap.

- **Move your cursor fast and get close** → she startles (ears up, tail flags
  white — the real white-tail alarm display) and bolts in the opposite
  direction.
- **Approach slowly** → within ~360px and moving calmly, she gets curious and
  faces you. Get within ~75px while still moving slowly and holding there for
  a moment → she'll let you feed her, then pet her. Being fed/petted slowly
  raises a "trust" meter (currently in-memory only, resets on quit / via the
  menu).
- Otherwise she just does her own thing: standing, looking around, walking to
  a new spot, grazing, chewing, chewing-while-looking-around, occasional
  playful jumps, and — after a couple minutes with no interaction — lying
  down to sleep (a fast cursor nearby will still startle her awake).

All the thresholds (scare distance/speed, curious/pet radius, hold time) are
in `DeerBrain.Tuning` at the top of
[`Sources/DeerFriend/DeerBrain.swift`](Sources/DeerFriend/DeerBrain.swift) —
good first thing to play with.

## Project layout

- `DeerPose.swift` — the rig's joint parameters for a single frame (leg
  angles, neck angle, ear perk, tail flag, etc).
- `AnimationClips.swift` — pure functions turning "time / gait phase" into a
  `DeerPose` for each animation (standing, walking, running, grazing, …).
- `DeerRenderer.swift` — draws a `DeerPose` into a tiny off-screen bitmap
  (antialiasing off) and returns a `CGImage`; this is the actual pixel-art
  drawing code (body/leg/tail/head shapes, palette).
- `DeerBrain.swift` — the behavior state machine: tracks the cursor,
  decides what state she's in, moves her around the screen, and picks the
  pose each tick.
- `DeerView.swift` / `AppDelegate.swift` — the transparent overlay window
  that follows her and blits whatever `DeerBrain` produced.
- `StatusBarController.swift` — the 🦌 menu bar item.

## Dev tool: pose snapshots

Render every animation pose straight to PNG (no live window, no permissions)
to eyeball the rig after changes:

```bash
swift build -c release
.build/release/DeerFriend --snapshot /tmp/deer_snapshots
open /tmp/deer_snapshots
```

## Ideas for next iterations

- Persist trust across launches (small JSON/UserDefaults file).
- Distinguish "feed" (click-and-hold to offer food) from "pet" (just
  hovering) as separate gestures rather than one time-based approach.
- Multi-monitor support (currently roams the main screen's visible frame).
- React to real windows (walk along a window's top edge, like Shimeji).
- Idle sound effects (small hoof steps, a soft chuff).
- Swap the procedural rig for hand-painted sprite sheets if you want a more
  bespoke look, while keeping `DeerBrain`'s state machine as-is.

## Browser prototype (current focus)

`web/index.html` is a self-contained browser version with the redesigned
spotted-fawn sprite (knee/hock joints, head that follows the neck, flagging
tail, tongue), a meadow with flowers and butterflies, and an **Auto mode**
toggle. Auto on: she roams, grazes, plays, sleeps and reacts to your cursor.
Auto off: drive her with the keyboard/mouse (see the Controls panel).

```bash
python3 -m http.server 8742 --directory web
open http://localhost:8742
```
