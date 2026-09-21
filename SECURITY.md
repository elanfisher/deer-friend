# Security

Deer Friend is a small local desktop toy. If you find a security problem, please open a
[private security advisory](https://github.com/elanfisher/deer-friend/security/advisories/new)
instead of a public issue.

## What the app does and doesn't do

- **No network access.** The Mac app shows a bundled HTML page in a web view. A
  Content-Security-Policy blocks all network requests, and the app refuses to navigate anywhere
  except that bundled page. The only outside request is a Google web font, and only in the browser
  prototype (`web/index.html` opened directly), never in the Mac app.
- **No special permissions.** It reads the cursor position (`NSEvent.mouseLocation`) and the
  positions of on-screen windows (to perch on top of them), neither of which needs Accessibility or
  Screen Recording permission. It doesn't read keystrokes, screen contents or files.
- **Click-through.** Its window ignores all mouse events, so it can't intercept clicks meant for
  other apps.
- **Stored data.** Only its own settings (size, display, toggles) in `UserDefaults`, and your
  Design Lab picks in the web view's `localStorage`.

## Automated checks

Every push and pull request (and weekly) runs:

| Check | What it looks for |
| --- | --- |
| **ClamAV** | Malware in the source tree *and* in the built `DeerFriend.app`, with freshly updated virus definitions |
| **Binary audit** | The app links only Apple system frameworks, contains no URLs, requests no entitlements, and has a valid code signature |
| **Web page audit** | `web/index.html` references no hosts other than the Google font |
| **CodeQL** | Security and quality issues in the Swift, the JavaScript, and the workflows |
| **Semgrep** | Known-dangerous code patterns (JavaScript, secrets, GitHub Actions) |
| **Gitleaks + TruffleHog** | Secrets anywhere in the git history (two independent scanners) |
| **zizmor** | Security problems in the GitHub Actions workflows themselves |
| **OpenSSF Scorecard** | Supply-chain hygiene; results appear under Security → Code scanning |

Every action is pinned to an exact commit and every scanner image to an exact digest, so a
compromised upstream tag can't change what runs. Dependabot proposes updates to the actions.
