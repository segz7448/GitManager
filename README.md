# GitManager

A personal GitHub control panel — manage repos, browse/edit files, upload zip
archives as commits, monitor GitHub Actions runs, and get plain-English
explanations of CI failures. Built with bare React Native + Expo native
modules (no Expo Go, no EAS, no Expo cloud services). All GitHub calls go
straight from the device to `api.github.com`.

## Stack

- React Native 0.86 (bare workflow, built via `expo prebuild`)
- Expo native modules used as libraries only: `expo-secure-store`,
  `expo-file-system`, `expo-document-picker`, `expo-sharing`, `expo-clipboard`
- `@actualwave/react-native-codeditor` — WebView + CodeMirror syntax
  highlighting for the file editor
- `jszip` — in-memory zip extraction on-device
- `@react-navigation` — stack + tab navigation
- Direct `fetch` calls to the GitHub REST API (`src/services/github.js`) —
  no SDK dependency

## First-time setup

```bash
npm install
npx expo prebuild --platform android
```

`expo prebuild` generates the `android/` folder from `app.json` and the
plugins in `plugins/`. It runs entirely locally — no Expo account or token
is contacted. Re-run it any time native config changes; it's safe to delete
`android/` and regenerate.

## Building the APK yourself (no cloud build service)

The included workflow (`.github/workflows/build-apk.yml`) does exactly what
`npx expo prebuild && cd android && ./gradlew assembleRelease` would do
locally, just running on a GitHub Actions runner. Trigger it with a push to
`main` or manually via `workflow_dispatch`. The signed APK is uploaded as a
build artifact you can download from the Actions run.

### Optional: signing a release build

If you want a properly signed release APK (not just a debug-signed one),
add these repo secrets:

- `RELEASE_KEYSTORE_BASE64` — your `.keystore` file, base64-encoded
- `RELEASE_STORE_PASSWORD`
- `RELEASE_KEY_ALIAS`
- `RELEASE_KEY_PASSWORD`

Without these secrets, `plugins/withReleaseSigning.js` falls back to the
default debug keystore, so the build still succeeds — it just won't be
suitable for anything beyond installing directly on your own device (which
is fine, since that's the intended use).

## Authentication

On first launch, paste a GitHub Personal Access Token (classic or
fine-grained). Required scopes: `repo`, `workflow`, `read:user`. The token
is stored using `expo-secure-store` (Android Keystore-backed encrypted
storage) and never leaves the device except in `Authorization` headers sent
directly to GitHub.

## Project structure

```
App.js                     Navigation shell, auth gate
index.js                   Entry point (bare RN registration)
src/context/AuthContext.js Token state
src/services/github.js     All GitHub REST API calls
src/utils/logParser.js     Pattern library for explaining CI errors
src/screens/               One file per screen
plugins/                   Custom Expo config plugins (native build config)
.github/workflows/         CI build pipeline
```

## Notes on the zip-upload feature

Picking a `.zip` reads it into memory, unpacks it with JSZip on-device, and
shows a file tree preview. Confirming the commit uploads every file in a
single Git commit using the Git Data API (blobs → tree → commit → ref
update) rather than one API call per file, so large uploads don't hit rate
limits as quickly.

## Notes on the error parser

`src/utils/logParser.js` holds a regex pattern library covering common
failure modes: Kotlin/Gradle/Android SDK, npm/Metro/Expo prebuild, keystore
signing, and generic CI runner issues. It's intentionally pattern-based
(no LLM calls) so it works offline and instantly. Extend `PATTERNS` in that
file as you hit new recurring failure types in your own builds.
