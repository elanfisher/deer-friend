# Locking the repository down

Only the owner can push to a personal repository — GitHub allows nobody else unless you add them
as a collaborator. Everyone else can fork it and open pull requests, but cannot change anything
here. These two rulesets add a second layer on top of that: they stop *anything* (including a
stray script, or a token that leaks) from rewriting history or publishing a release behind your back.

## Import them (about a minute)

1. Repository → **Settings** → **Rules** → **Rulesets**
2. **New ruleset** → **Import a ruleset** → choose `protect-main.json`, then **Create**
3. Repeat for `protect-release-tags.json`

**What they do**

| Ruleset | Effect |
| --- | --- |
| Protect main | `main` can only change through a pull request; no force-pushes, no deleting the branch; the security checks must pass before merging |
| Protect release tags | Only you can create, move or delete `v*` tags — the tags that publish a public download |

Both let a repository **admin** (you) bypass them, so you can still push straight to `main` when
you want to. To make the rules apply to you too, delete the `bypass_actors` block before importing.

## Also worth checking

| Where | What to look for |
| --- | --- |
| Settings → **Collaborators and teams** | Should list only you |
| Settings → **Actions** → General → Workflow permissions | **Read repository contents** (the release workflow asks for write only where it needs it) |
| Settings → **Code security** | Turn on secret scanning, push protection and Dependabot alerts |
| Your account → **Password and authentication** | Two-factor authentication on — this is what actually stops someone pushing as you |
| Your account → **Settings → Developer settings → Personal access tokens** | Revoke anything you don't recognise, and anything a machine no longer needs |

## A note about this machine

Commits pushed from here use the GitHub credentials saved on your Mac (in the Keychain), so
anything running on this machine can push as you. If you'd rather that stopped, remove the
credential (`Keychain Access` → search `github.com`) or revoke that token, and pushes will need
your login again.
