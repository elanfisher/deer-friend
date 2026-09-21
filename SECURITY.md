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

- CodeQL (Swift, JavaScript, GitHub Actions) on every push and pull request, plus weekly.
- Gitleaks secret scanning over the full git history.
- Dependabot keeps the GitHub Actions up to date.
