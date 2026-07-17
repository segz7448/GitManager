# Phase 2 — Repository Safety

Builds on the Phase 1 database layer to add the requested safety net around
edits, uploads, and commits.

## 1. Automatic file backups (open + save)

Implemented exactly as specced (`src/db/fileBackups.js`):
- Opening a file in the editor takes a hidden "open" backup of its
  current content before any edit happens (skipped if identical to the
  most recent backup, to avoid pointless duplicates from just re-opening
  a file without changing it).
- Saving/committing a file takes a timestamped "save" backup right
  before the push.
- Backups are kept for 30 days, pruned automatically, or deletable
  manually from the new **Restore** button in the file editor.
- Bulk commits (Staged Changes screen) also snapshot every file just
  before committing.

This is intentionally a local SQLite table rather than literal files at
`.gitmanager/backups/...` — React Native apps don't have a stable,
user-visible filesystem location to write loose files the way a
desktop/Termux tool would, and a DB table gives the same "browse and
restore any prior version" capability with less risk of orphaned files
piling up outside the app's control.

## 2. Restore previous file version

New **Restore** button in the file editor header opens
`VersionHistoryModal`, which lists all local backups for that file,
shows a diff of any selected backup against the current editor content,
and restores it back into the editor on confirmation.

## 3. Undo changes / Revert commit

- **File History screen**: each commit now has a "Revert this commit"
  button. This creates a new commit that undoes that commit's changes
  (safe for history that's already been shared/pushed elsewhere).
- **Repository Safety screen** (new "Safety" button on the repo screen):
  "Undo last commit on {branch}" moves the branch pointer back to the
  previous commit. This is offered only for the current tip and only
  when the branch hasn't moved since the app last read it, to avoid
  discarding someone else's newer work.

## 4. Auto-branch before major operations

Both ZIP upload and bulk-commit (Staged Changes) now default to creating
a timestamped backup branch (`gitmanager-backup-YYYYMMDD-HHMMSS`)
pointing at the current branch tip **before** touching anything,
matching the requested workflow:

```
main
  |
  gitmanager-backup-20260716-143022
  |
  (upload/bulk-edit happens on main)
```

This is a checkbox the user can toggle off per-operation. If the backup
branch itself fails to create (e.g. permissions), the app asks whether
to proceed without the safety net rather than silently skipping it.

## 5. One-click rollback

The new **Repository Safety** screen lists every backup branch created
this way, each with:
- **Restore "{branch}" from this** — force-moves the branch back to
  exactly what it was before that operation (the "if failure → restore
  backup branch" flow from the request).
- **Delete branch** — cleans up a backup branch once it's no longer
  needed.

## 6. Conflict detection before pushing

- **File editor**: before committing, the app checks whether the
  branch has moved since the file was opened. If so, it blocks the
  commit and offers to reload the latest version instead of pushing
  blind.
- **Staged Changes (bulk commit)**: before committing, every staged
  file's current GitHub sha is checked against the sha it had when
  staged. Any that changed are listed, with the option to proceed
  anyway or go back and review.

## Files changed
- `src/services/github.js` — added `listRepoCommits`, `getCommitDetail`,
  `createBranch`, `deleteBranch`, `generateBackupBranchName`,
  `checkForConflict`, `revertCommit`, `undoLastCommit`
- `src/db/database.js` — added `file_backups` and `safety_operations` tables
- `src/screens/FileEditorScreen.js` — open/save backups, Restore button,
  conflict check before commit
- `src/screens/FileHistoryScreen.js` — Revert this commit button
- `src/screens/StagedChangesScreen.js` — auto-branch toggle, per-file
  conflict check, backup snapshots before bulk commit
- `src/screens/ZipUploadScreen.js` — auto-branch toggle before upload,
  rollback-aware error messaging
- `src/screens/RepoDetailScreen.js` — new "Safety" action button

## Files added
- `src/db/fileBackups.js`, `src/db/safetyLog.js`
- `src/services/repoSafety.js`
- `src/screens/RepoSafetyScreen.js`
- `src/components/VersionHistoryModal.js`

## Design notes / limitations
- **Revert vs Undo**: revert (adds a new commit) is offered per-commit in
  File History and is safe for shared history. Undo (moves the branch
  pointer back) is only offered for the tip commit from the Safety
  screen, since rewriting history further back risks discarding other
  people's work - this matches how real Git tooling treats the two
  differently.
- **Conflict detection** uses GitHub's existing sha-based optimistic
  concurrency (the same mechanism the Contents API already enforces) —
  the app now checks and explains it proactively instead of surfacing a
  raw 409 error after the fact.
- Branch-based backups still count against the repo's branch list and
  aren't auto-deleted — the Safety screen's "Delete branch" button is
  the intended cleanup path once a backup is no longer needed.

## Not yet done (upcoming phases)
Branch switching UI, cherry-pick, merge, stash, clone, fork (Phase 3);
file/folder rename & move, duplicate, compare-against-remote (Phase 4);
issues, project boards, discussions, stars, watch, collaborators
(Phase 5); real terminal streaming, background execution, tabs,
persistent sessions (Phase 6); token expiry warning, multi-account,
permission checker (Phase 7).
