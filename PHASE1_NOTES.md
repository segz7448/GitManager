# Phase 1 — Critical Bug & Risk Fixes

This phase addressed the static-inspection findings only. No new user-facing
features (backups, undo, branch tools, etc.) were added yet — those start in
Phase 2 onward.

## 1. Fixed: "extraction stays at 0%" (ZIP upload + artifact download)

**Root cause:** both `ZipUploadScreen.js` and `RunDetailScreen.js` read the
whole zip into memory as one base64 string (`readAsStringAsync`) and then
ran `JSZip.loadAsync` synchronously in a single JS tick. This blocked
React's render loop, so any "Extracting X%" label set beforehand never
painted until the entire operation finished (or the app ran out of memory
and silently died first).

**Fix:**
- Both screens now yield to the UI thread (`await new Promise(r => setTimeout(r, 0))`) between each real processing stage, so progress state actually renders.
- Extraction progress is now genuinely incremental: parsing → indexing (chunks of 25 entries) → ready, with a visible progress bar in `ZipUploadScreen`, and download → extracting (with sub-stage %) → writing in `RunDetailScreen`.

## 2. Fixed: no size guard on ZIP/artifact extraction (OOM crash risk)

- Added `FileSystem.getInfoAsync(uri, { size: true })` checks **before**
  reading the file into memory.
- ZIP upload: warns above 150MB ("may be slow/fail, continue anyway?"),
  hard-blocks above 400MB ("split into smaller archives").
- Artifact download: hard-blocks extraction above 400MB with a suggestion
  to download from github.com directly instead.
- These thresholds are conservative for typical low-RAM Android phones,
  where base64 string + JSZip's decompressed buffers can be 3x the
  original zip's size in resident memory.

## 3. Added: crash-recovery session journal (`src/db/sessionJournal.js`)

A new SQLite-backed journal records the start of any long-running
operation (zip upload, artifact download) before it begins, and deletes
the record when it finishes cleanly. If the app is killed mid-operation,
the next launch shows a dismissible `RecoveryBanner` explaining what
didn't finish, instead of the previous behavior of silently losing all
context.

This isn't full resumability yet (a genuinely resumable chunked
upload/extraction pipeline is a bigger change slated for a later phase) —
it's the crash-visibility layer requested in the static-inspection notes.

## 4. Added: file editor autosave + draft recovery

`FileEditorScreen.js` previously had no autosave at all — killing the app
while a file was dirty (not yet committed or staged) lost the edit
completely. Now:
- Every 4 seconds while dirty, the current content is persisted locally (`src/db/editorDrafts.js`).
- On reopening the same file, if an uncommitted draft exists and differs from the current upstream content, the user is prompted to restore or discard it.
- The draft is cleared automatically after a successful commit or stage.

## 5. Added: local database layer (`src/db/database.js`)

There was previously no persistence layer at all beyond `SecureStore` (for
the token) and in-memory React state. Added a single SQLite database
(`gitmanager.db`) with four tables, each with a focused module:
- `repo_cache` (`src/db/repoCache.js`) — offline cache of directory listings
- `session_journal` (`src/db/sessionJournal.js`) — crash recovery
- `editor_drafts` (`src/db/editorDrafts.js`) — autosave
- `file_meta_cache` (`src/db/fileMetaCache.js`) — last-modified timestamp cache

This is also the foundation Phase 2 (backups, undo, revert) will build on.

## 6. Added: offline repository cache

`RepoDetailScreen.js` now saves every successfully fetched directory
listing to the local cache. If a later fetch fails (no network, GitHub
rate limit, etc.), the last-known listing is shown with a clear
"Showing cached data from <time> — couldn't reach GitHub" banner and a
Retry button, instead of a blank error screen.

## 7. Added: last-modified date/time on files and folders

Per your request, every file/folder row (`src/components/FileRow.js`) now
shows "Modified Xm/h/d ago" (or a full date beyond 30 days). This is
fetched lazily per visible row from GitHub's commit history for that
path and cached locally for 10 minutes, so opening a large folder doesn't
trigger a burst of API calls or rate-limit the token.

## Files changed
- `App.js` — init local DB on launch, render `RecoveryBanner`
- `package.json` — added `expo-sqlite`, `@react-native-async-storage/async-storage`
- `src/screens/ZipUploadScreen.js` — size guard, real progress, journaling
- `src/screens/RunDetailScreen.js` — same, for artifact download/extraction
- `src/screens/FileEditorScreen.js` — autosave + draft recovery
- `src/screens/RepoDetailScreen.js` — offline cache fallback, `FileRow` integration

## Files added
- `src/db/database.js`, `src/db/repoCache.js`, `src/db/sessionJournal.js`, `src/db/editorDrafts.js`, `src/db/fileMetaCache.js`
- `src/components/RecoveryBanner.js`, `src/components/FileRow.js`

## Not yet done (upcoming phases)
Repository safety (backups, undo, revert, auto-branching), full Git
feature set (branch management, cherry-pick, merge, stash, clone, fork),
file rename/move/duplicate, GitHub management (issues, boards,
discussions, stars, collaborators), real terminal streaming, and security
hardening (token expiry warning, multi-account, permission checker) are
all planned for Phases 2–7 as outlined.
