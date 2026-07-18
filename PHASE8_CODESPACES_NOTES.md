# Codespaces, Syntax Highlighting, and CI Workflow Auto-Suggestion

## Codespaces (new tab, full lifecycle management)

Added as a bottom tab between Terminal and Settings, and in the sidebar menu, as requested.

**What "full functionality" means here, precisely:** GitHub's REST API gives full lifecycle
control - list, create, start, stop, delete, and machine-type selection - all of which is wired
up in CodespacesScreen.js and the "Create a codespace" action in Git Tools. What it does not
give is a way to embed the actual coding session (that's a VS Code Web connection at the
codespace's web_url, a whole separate browser-based editor, not a REST payload). So "opening"
a codespace launches that web_url in the system browser - which is the correct way to actually
use it, not a limitation of this app. Reimplementing a code editor natively to avoid that browser
hop would be a much bigger, separate project and would in practice be worse than the real VS Code
Web experience GitHub already provides.

- CodespacesScreen.js — list with live state (Available/Starting/Shutdown/Failed/etc.), start/stop/
  delete, "Open in browser," and a warning if uncommitted/unpushed changes exist inside a codespace.
- Creation happens from a repo's Git Tools screen (matches github.com's own flow of creating a
  codespace from a specific repo+branch), then the codespace shows up in the tab once provisioned.
- Added codespace to the Security screen's recommended token scopes, since creating/managing
  codespaces requires it and a missing scope would otherwise surface as a confusing 403/404.

## Syntax highlighting in the file editor

This was already implemented in the project you uploaded — FileEditorScreen.js already used
@actualwave/react-native-codeditor with a working extension-to-language map covering JS/TS, JSX/TSX,
Python, Java, C/C++, Go, Rust, Ruby, PHP, JSON, YAML, Markdown, HTML/CSS, and Shell, with a sensible
fallback. I checked it end-to-end and it's functioning correctly, so no changes were made here -
flagging this so it's clear it wasn't silently skipped or re-done redundantly.

## CI workflow auto-suggestion

New module src/workflows/ (detectProjectType.js + generateWorkflow.js), wired into two places:

1. ZIP upload flow (the specific case you described): right after extraction, the app checks
   (a) whether the zip itself already contains a .github/workflows/*.yml, and (b) whether the
   target repo/branch already has one. If neither, it scans the extracted file list for a
   recognized project marker and offers to include a generated .github/workflows/build.yml as
   part of the same commit, with a preview of what was detected and a checkbox to include/skip it.
2. Git Tools -> "Suggest a CI workflow for this repo" — the same detection run against an
   existing repo's current tree (not just a fresh upload), so this isn't limited to the upload
   moment only.

Detected project types: Node.js (npm/yarn/pnpm, detected via lockfile), Python, Go, Rust, Java
(Maven or Gradle), Ruby, PHP, .NET, and Docker. Detection is manifest-based (recognizing marker
files like package.json, go.mod, Cargo.toml, etc.) - it doesn't attempt deep build-file
parsing, so an unusual or multi-language repo may not be recognized; in that case nothing is
suggested rather than guessing wrong.

Generated workflows are deliberately minimal starting points (checkout -> setup toolchain ->
install -> build -> test), not tuned production pipelines - expect to adjust versions, caching,
matrix builds, or deployment steps for a specific project. One accuracy note: the Rust template
uses dtolnay/rust-toolchain, not actions-rs/toolchain - the latter was archived by its
maintainers in October 2023 and is deprecated, so it was deliberately avoided here.

## Files changed
- App.js — Codespaces tab registration
- src/components/SidebarMenu.js — Codespaces menu item
- src/services/github.js — full Codespaces REST API (list/create/start/stop/delete/update/machines)
- src/screens/GitToolsScreen.js — codespace creation action, CI workflow suggestion action
- src/screens/ZipUploadScreen.js — workflow detection + suggestion card wired into the upload flow
- src/screens/SecurityScreen.js — added codespace to recommended scopes

## Files added
- src/screens/CodespacesScreen.js
- src/workflows/detectProjectType.js, src/workflows/generateWorkflow.js
