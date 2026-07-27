# Termux-Styled Terminal, In-App Codespace View, Codespace Auto-Restart

## 0. Terminal now looks and behaves like Termux's own UI

Still backed by the same transport as before (Android's RUN_COMMAND intent to the
real Termux app - see src/services/termux.js for why that's a one-shot request/
response, not a live keystream) - what changed is the whole visual/interaction
layer on top of it, to actually look and feel like the terminal in your screenshot:

- Near-black palette matching Termux's own (not this app's usual dark-blue
  GitHub theme), monospace throughout, green "~ $" prompt.
- ANSI color rendering (src/utils/ansiParser.js + components/AnsiText.js) -
  command output with color codes (git status, linters, test runners, ls --color)
  now actually shows in color instead of raw escape bytes. Non-color escape
  sequences (cursor movement, clear-screen - things a scrolling log view can't
  represent anyway) are cleanly stripped rather than left as garbage text.
- The special-keys row from your screenshot (ESC, TAB, arrows, HOME/END,
  PGUP/PGDN, CTRL, ALT), all wired to real behavior given how commands actually
  reach Termux from this app:
  - ESC clears the input line, TAB inserts a tab character
  - Left/Right move the cursor in the input (ALT+Left/Right jumps by word,
    like a real shell)
  - Up/Down recall command history (seeded from past sessions, so it's not
    empty on a fresh app launch)
  - HOME/END jump to the start/end of the line
  - PGUP/PGDN scroll the output log
  - CTRL is a sticky modifier; CTRL then C stops the currently running command
    (the real functional equivalent of a terminal's Ctrl+C)

What's still not possible, and why: actual live, character-by-character PTY
interaction (running vim, top, htop and having them repaint in real time) needs
a real terminal emulator with its own PTY - native Android/C code, the way
Termux itself is built - which isn't reachable from outside Termux's own
process, and isn't something I can compile/verify in this environment. This
update makes the experience of composing and running commands look and feel
like a real terminal; it doesn't change what's actually transportable to/from
Termux.

## 1. In-app WebView for opening codespaces

New CodespaceWebViewScreen.js - opening a codespace now stays inside GitManager
instead of switching to your phone's browser. It's the real VS Code Web session
(GitHub's own product, unchanged) inside an in-app container tuned for a phone:
a correct mobile viewport injected on load, pinch-to-zoom enabled, the Android
back button navigating within the page instead of exiting straight to the repo
screen, a reload button, and an "Open in Browser" fallback in case anything
about VS Code Web doesn't get along with the in-app WebView on a given device.

Honest limit: this can't redesign VS Code Web's own interface (that's
Microsoft's product, not this app's markup) - it's a properly-behaved container
around the real thing, not a custom mobile redesign of the editor itself.

## 2. Codespace auto-restart (the honest version of "keep it alive")

Important thing I found while building this and want to be upfront about: a
simple API status check does not reset GitHub's idle timer - GitHub only resets
it on real terminal/editor activity inside the codespace. So a "ping to prevent
idle" would not have actually worked, and I didn't build one that fakes it.

What genuinely works, and what's built: a per-codespace "Auto-restart if GitHub
stops it" toggle. While enabled, the app checks periodically (every 45s while
the Codespaces screen is open; roughly every 15+ minutes in the background,
which is Android's own floor on background task frequency) and starts the
codespace back up automatically if GitHub has stopped it for being idle. This
can't stop the idle stop from happening, but it closes the gap between "GitHub
stopped it" and "it's running again" without you needing to notice and tap
Start yourself - which is what you actually described wanting. The in-app copy
and a one-time confirmation both state this plainly rather than implying it
prevents idle entirely.

## Files changed
- src/screens/TerminalScreen.js - full visual/interaction rewrite
- src/screens/CodespacesScreen.js - in-app WebView navigation, auto-restart toggle
- src/backgroundTasks.js - codespace auto-restart check added to the existing
  periodic task
- App.js - registered CodespaceWebViewScreen
- src/db/database.js - added codespace_auto_restart table

## Files added
- src/utils/ansiParser.js, src/components/AnsiText.js - ANSI color rendering
- src/components/TerminalKeyRow.js - the special-keys row
- src/screens/CodespaceWebViewScreen.js - in-app codespace viewer
- src/db/codespaceAutoRestart.js - persists which codespaces have auto-restart on
- Tests: src/utils/__tests__/ansiParser.test.js

## Honest limitations (stated plainly, not buried)
- No live PTY - this is still one-command-at-a-time against Termux, just styled
  and behaving much closer to a real terminal around that constraint.
- Auto-restart cannot prevent GitHub's idle stop, only shorten how long a
  codespace stays stopped afterward.
- Background-app auto-restart checks are subject to Android's ~15 minute floor
  on background task frequency - the 45-second foreground loop is what gives
  near-immediate restarts while the app is actually open.
- The in-app WebView shows GitHub's real VS Code Web UI as-is; it isn't a custom
  mobile redesign of that editor's interface.
