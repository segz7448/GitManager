# Upload Files/Folders (not just ZIP) and Download Repo as ZIP

## Upload: files and folders, not just a pre-made ZIP

The upload screen now offers three ways to bring content in, all feeding the same
review/gitignore/CI-suggestion/backup-branch/commit pipeline already built:

- Choose ZIP File - unchanged, existing flow.
- Choose Files - uses expo-document-picker's multi-select (multiple: true), so
  you can pick several individual files at once. Like any flat file picker, this has
  no folder structure - each selected file lands directly at the upload target path.
- Choose Folder - uses Android's real folder-picker API (Storage Access
  Framework), recursively walking the chosen folder's contents and preserving the
  relative folder structure in the commit.

Honest limitation on folder upload: there's a confirmed, long-standing Android/Expo
bug (expo/expo#20102) where reading a nested subfolder's contents can incorrectly
return its parent folder's contents instead, once you're more than one level deep.
I built a defensive check for this: if a subfolder's listing looks identical to its
parent's, the walker stops descending into it rather than looping on duplicate data,
and flags the result as "possibly incomplete" - the app then warns you before
committing and suggests zipping the folder instead if it has multiple levels of
subfolders. This isn't a bug I introduced or can fix from the JS side; it's a
real platform-level limitation I'm being upfront about rather than silently
shipping a folder uploader that might quietly drop nested files.

Both new modes reuse everything already built for ZIP upload:
- .gitignore / default-ignore filtering (reads a .gitignore if one of the selected
  files/folder contents includes it)
- CI workflow auto-suggestion
- auto-backup-branch before committing
- the same review list, with ignored files shown struck-through and overridable

One new guard specific to files/folder mode: since each file becomes its own
API call when committing (unlike a zip, which is one big local decode), selecting
more than 200 files shows a warning about the extra time and rate-limit cost before
proceeding - this isn't a memory risk like large zips, just a slower, more
API-expensive operation.

## Download repository as ZIP (like github.com's "Download ZIP" button)

New "Download '{branch}' as ZIP" action in Git Tools, right next to Clone/Fork. Uses
GitHub's own /repos/{owner}/{repo}/zipball/{ref} endpoint - the exact same thing
the "Download ZIP" button on github.com calls - downloaded via the same proven
FileSystem.createDownloadResumable pattern already used elsewhere in this app for
artifact downloads, with a live progress percentage. Once downloaded, it hands off
to the share sheet (expo-sharing) so you can save it to Downloads, Google Drive,
or wherever - no new permissions or dependencies needed, both packages were already
in use.

## Files changed
- src/screens/ZipUploadScreen.js - three upload-source buttons, source-aware
  content reading and gitignore checking, file-count warning for direct uploads
- src/screens/GitToolsScreen.js - "Download as ZIP" action
- src/services/github.js - getRepoZipDownloadUrl()

## Files added
- src/utils/safFolderWalker.js - SAF-based recursive folder picker/walker,
  with the defensive bug-detection described above
- src/utils/__tests__/safFolderWalker.test.js - tests for its pure helper
  functions (URI name extraction, array-equality check used for bug detection)

## Honest limitations
- Folder upload may miss deeply-nested files on some Android/Expo version
  combinations, per the platform bug described above - the app detects and warns
  when this happens rather than silently under-uploading.
- No iOS-specific folder picker was built (SAF is Android-only) - this app is
  already Android/Termux-focused per its existing feature set, so this wasn't a
  gap for its actual use case, but worth naming if iOS support is ever wanted.
- As with the earlier test-writing round, I could not execute
  safFolderWalker.test.js in this sandbox (no network access to install Jest) -
  traced by hand, but run npm test to confirm.
