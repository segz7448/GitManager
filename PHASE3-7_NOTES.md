# Phases 3–7 — Git Features, File Management, GitHub Management, Terminal, Security

This single document covers Phases 3 through 7, delivered together per your request.
Phases 1 and 2 (bug fixes and repository safety) are documented separately in
`PHASE1_NOTES.md` and `PHASE2_NOTES.md`, and are included unchanged in this zip.

---

## Phase 3 — Core Git Features

New "Git Tools" button on the repo screen opens a hub for everything below.

- **Branch switching** — already existed; kept, now backed by the same modal as create/delete.
- **Branch creation & deletion** — new `BranchManagerModal`, reachable from the existing branch
  button. Creating branches from the current branch; the default branch can't be deleted from here.
- **Commit history browser** — new `CommitHistoryScreen`, repo-wide (as opposed to the existing
  per-file history), paginated, each commit linkable to github.com or cherry-pickable.
- **Cherry-pick** — `cherryPickCommit()` rebuilds a tree on the destination branch reusing the
  source commit's blob shas (no native cherry-pick endpoint exists on GitHub's API). Handles
  added/modified/removed/renamed files; guards against deleting a path that's already gone on
  the destination branch (GitHub's tree API errors on that otherwise).
- **Merge** — `mergeBranch()` uses GitHub's native merge endpoint. A 409 (conflict GitHub can't
  auto-resolve) is caught and the user is pointed to opening a Pull Request instead, since there's
  no in-app conflict editor.
- **Stash** — since there's no working directory on a mobile app, this shelves the current staged
  changes (same shape as the existing staging system) under a label, in a new `stashes` table.
  "Pop" re-stages them.
- **Clone repository locally** — downloads a branch's text file contents into a local SQLite-backed
  snapshot for offline browsing (`LocalCloneScreen`). Binary files are recorded (path/size) but not
  downloaded. Capped at 400 files to avoid spending excessive time/rate-limit on huge repos — above
  that, the app suggests a real `git clone` instead.
- **Fork** — straightforward wrapper around GitHub's fork endpoint.

## Phase 4 — File Management

Long-pressing any file or folder row now opens an action sheet (`FileActionsModal`) instead of
jumping straight to delete.

- **Rename / move** (file and folder) — implemented as one atomic commit via the Git Data API:
  add the new path (reusing the existing blob sha, no re-upload) and remove the old path in the
  same tree, rather than a separate delete + create that could partially fail.
- **Duplicate file** — same approach, minus the delete step.
- **Compare against remote** — new `CompareRemoteScreen` diffs a file's local backups (from
  Phase 2) or currently staged edit against what's actually on GitHub right now.

Folder rename/move gathers every blob under the old path prefix (via a recursive tree fetch) and
rewrites all of them in one commit.

## Phase 5 — GitHub Management

New "GitHub" button on the repo screen.

- **Issue creation, comments, close/reopen** — new `RepoIssuesScreen` (list + create, filterable
  by open/closed/all) and `IssueDetailScreen` (comment thread + toggle state). This is separate
  from the existing cross-repo `IssuesScreen`, which is a different, read-only "my issues" feed.
- **Repository stars** — toggle via `GET/PUT/DELETE /user/starred/{owner}/{repo}`.
- **Watch repository** — GitHub's modern equivalent is the subscription endpoint (Watching /
  Participating-only / Ignoring), which is what github.com's own Watch button uses under the hood.
- **Manage collaborators** — list, invite (as a pending invitation, matching GitHub's own flow),
  and remove.
- **Project boards & Discussions** — intentionally link out to github.com rather than a half-built
  in-app implementation. Both are substantial GraphQL-based systems (Projects v2, Discussions API)
  that would need significant additional work to do well; a shallow in-app version would be worse
  than a clean deep link for now. Flagged here so this is a visible decision, not a silent gap.

## Phase 6 — Terminal

**Important context on what's actually possible here:** Android's `RUN_COMMAND` intent (which this
app's Termux integration already used, in `plugins/termux-native/TermuxRunCommandModule.kt`)
delivers exactly one final result bundle — there is no OS-level channel for incremental stdout.
True line-by-line PTY streaming isn't possible through this transport without changes to Termux
itself, which is out of scope here. Rather than silently overpromise, here's what was actually built:

- **"Real" output streaming** — implemented via a well-understood workaround: every command is
  wrapped in a shell one-liner that backgrounds the real command with its output redirected to a
  log file under `~/.gitmanager/jobs/<job_id>/`, records the child PID, and returns almost
  immediately. The app then polls that log file's content every 1.5s and updates the UI — genuinely
  incremental from the user's point of view, built entirely from shell redirection with no native
  code changes needed.
- **Background execution** — the shell command keeps running via nohup/disown regardless of
  whether the RN app is open, since it lives entirely inside Termux's own process tree. A periodic
  background task (extending the existing expo-background-task infrastructure) checks for
  finished jobs and fires a completion notification — but Android's WorkManager enforces a
  15-minute floor on background task intervals, so that notification can lag up to ~15 minutes
  behind the job actually finishing. In-app polling is instant while the app is open; this is
  explained in the UI, not hidden.
- **Multiple terminal tabs** — each run command gets its own tab with a status dot
  (starting/running/success/failed); switching tabs switches which job's log is displayed.
- **Persistent sessions** — job metadata is stored locally (terminal_sessions table); reopening
  the Terminal screen after the app was fully killed restores all tabs and resumes polling any
  still-running jobs, rather than losing track of them.

## Phase 7 — Security

New "Security" screen, linked from Settings.

- **Token expiration warning** — reads the github-authentication-token-expiration response
  header GitHub sends on authenticated requests (classic PATs only — fine-grained tokens don't
  expose this via headers, which is disclosed in the UI rather than guessed at). Warns at 14 days
  out, and flags clearly if a token has already expired.
- **Token permission checker** — reads the X-OAuth-Scopes header (classic PATs) and compares
  against this app's recommended scopes (repo, workflow, read:user), flagging any that are
  missing. For fine-grained tokens, which don't expose scopes this way, the screen says so plainly
  rather than fabricating a scope list.
- **Multiple GitHub accounts** — each account's token is stored under its own SecureStore key
  (never in the SQLite metadata table, which isn't encrypted at rest). "Switching" copies the
  chosen account's token into the single active slot the rest of the app already reads from, so
  no other screen needed to change. Logging in through the normal flow also registers/updates that
  account in the switcher automatically.

## Files changed
- App.js — registered all new screens
- package.json — no new dependencies needed beyond Phase 1's expo-sqlite
- src/services/github.js — added ~25 functions (branches, merge, cherry-pick, fork, rename/move/
  duplicate, issues/comments, stars/watch/collaborators, token introspection)
- src/services/termux.js — background job execution, log polling, kill/cleanup
- src/backgroundTasks.js — terminal job completion check added to the existing periodic task
- src/context/AuthContext.js — account registration on login, switchAccount()
- src/screens/RepoDetailScreen.js — Git Tools / GitHub buttons, file actions modal wiring,
  branch manager wiring
- src/screens/TerminalScreen.js — full rewrite for tabs/background/persistence
- src/screens/SettingsScreen.js — link to new Security screen

## Files added
- src/db/stashes.js, localClones.js, accounts.js, terminalSessions.js
- src/components/BranchManagerModal.js, FileActionsModal.js
- src/screens/GitToolsScreen.js, CommitHistoryScreen.js, StashesScreen.js, LocalCloneScreen.js
- src/screens/CompareRemoteScreen.js
- src/screens/RepoIssuesScreen.js, IssueDetailScreen.js, RepoGitHubScreen.js
- src/screens/SecurityScreen.js

## Honest limitations, stated plainly
- Cherry-pick and merge operate at the tree/blob level via GitHub's API, not a real 3-way textual
  merge — good for clean cases, and the app is upfront when GitHub itself reports a conflict it
  can't resolve (points to opening a PR instead).
- Terminal "streaming" is polling-based (1.5s interval), not a true live PTY. This is disclosed in
  the terminal's own empty-state hint text, not just in this document.
- Local "clone" is a content snapshot for offline browsing, not a real .git checkout — there's no
  working directory or git binary running client-side in this app.
- Project boards and Discussions link out rather than being reimplemented in-app.
