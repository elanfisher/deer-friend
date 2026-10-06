# Installing Deer Friend

Pick your platform. Each takes a minute or two, and each shows one security warning the first
time, because the app isn't signed with a paid Apple/Microsoft certificate. That's expected and
the steps below get past it.

**The easy version:** open the [download page](https://elanfisher.github.io/deer-friend/), which
picks the right file for whatever computer you're on and walks you through it.

---

## 🍎 Mac (macOS 13 or newer)

1. Download **[DeerFriend-mac.dmg](https://github.com/elanfisher/deer-friend/releases/latest/download/DeerFriend-mac.dmg)**.
2. Double-click it in your Downloads. A window opens with the deer app and an Applications folder.
3. **Drag the deer onto the Applications folder.**
4. Open **Applications** (Finder → Go → Applications) and double-click **DeerFriend**.
5. macOS says it *"cannot verify the developer"*. Click **Done**, then open
   **System Settings → Privacy & Security**, scroll down to the line mentioning DeerFriend, and
   click **Open Anyway**. You only do this once.
   *(macOS 14 and earlier: right-click the app → **Open** instead.)*
6. She appears at the bottom of your screen, and a small deer appears in your **menu bar** at the
   top right. That's her menu.

**Prefer the Terminal?** This does the same thing with no warning to click through:

```bash
curl -L -o ~/Downloads/DeerFriend-mac.dmg https://github.com/elanfisher/deer-friend/releases/latest/download/DeerFriend-mac.dmg
hdiutil attach ~/Downloads/DeerFriend-mac.dmg
cp -R "/Volumes/Deer Friend/DeerFriend.app" /Applications/
hdiutil detach "/Volumes/Deer Friend"
xattr -dr com.apple.quarantine /Applications/DeerFriend.app   # skips the security warning
open -a DeerFriend
```

**To keep her around:** menu bar deer → **Launch at Login**.
**To remove her:** menu bar deer → **Quit**, then drag the app from Applications to the Trash.

---

## 🪟 Windows 10 / 11

1. Download **[DeerFriendSetup.exe](https://github.com/elanfisher/deer-friend/releases/latest/download/DeerFriendSetup.exe)**.
2. Double-click it in your Downloads.
3. A blue **"Windows protected your PC"** box appears. Click **More info**, then **Run anyway**.
4. Click through the installer. Tick **"Start Deer Friend when I sign in"** if you'd like her there
   every day.
5. She appears at the bottom of your screen. Her icon sits in the **notification area** at the
   bottom right — click the **^** arrow if you don't see it. That's her menu.

**If it says WebView2 is missing:** install Microsoft's free
[WebView2 runtime](https://go.microsoft.com/fwlink/p/?LinkId=2124703) and start her again.
Windows 11 and most Windows 10 PCs already have it.

**To remove her:** Settings → Apps → Deer Friend → Uninstall.

---

## 🌐 Chrome / Edge extension

She wanders along the bottom of web pages instead of your desktop. Works on any computer,
including Windows.

1. Download **[deer-friend-extension.zip](https://github.com/elanfisher/deer-friend/releases/latest/download/deer-friend-extension.zip)**
   and unzip it (Mac: double-click. Windows: right-click → **Extract All**). Keep the resulting
   folder somewhere you won't delete it, like Documents.
2. Go to `chrome://extensions` (Edge: `edge://extensions`).
3. Turn on **Developer mode** — top-right in Chrome, left sidebar in Edge.
4. Click **Load unpacked** and choose the unzipped folder.
5. Open any web page. Click her icon in the toolbar for settings.

Chrome may nag about Developer mode each time it starts; that's normal until the extension is
published on the Chrome Web Store.

---

## Playing with her

- Move **slowly** toward her and she watches your cursor.
- **Hover near her** to pet her (hearts).
- **Hold the mouse button down** by her mouth to feed her a clover.
- Turn on **Friend Mode** for a second fawn — they play, run around and nap side by side.
- She never blocks your clicks.

## Is it safe?

Every download is built in public by GitHub Actions from this repository, virus-scanned with
ClamAV, and published with a SHA-256 checksum and a signed build-provenance attestation. The app
makes no network connections and asks for no special permissions. See [SECURITY.md](SECURITY.md).
