# Phase 12 — Expo UI kit + FCM push notifications

## What changed

### 1. Real Expo component usage (not just Expo APIs)

Added and wired up:

- `expo-image` — cached, placeholder-aware image loading (`Avatar`)
- `expo-linear-gradient` — brand gradients on buttons, avatars, backgrounds
- `expo-blur` — frosted-glass panel (`GlassPanel`, available for future modal work)
- `expo-haptics` — tap/select/success/warning/error feedback, centralized in
  `src/utils/haptics.js` so it's one on/off switch instead of scattered calls
- `expo-status-bar` — replaces the plain React Native `StatusBar`
- `expo-navigation-bar` — Android nav bar now matches the app background
  instead of defaulting to black, plus edge-to-edge enabled in `app.json`
- `@expo/vector-icons` (Ionicons) — the app previously used zero icons
  anywhere (emoji and `›`/`●` characters instead). All rewritten screens now
  use real iconography.

### 2. A real UI kit (`src/components/ui/`)

`Button`, `Card`, `Badge`, `IconButton`, `Screen`, `GlassPanel`, `Avatar`,
`Input`, `EmptyState`, `SectionLabel` — all theme-driven off the existing
`src/theme.js` (extended with `radii`, `gradients`, `elevation`). Import
from the barrel: `import { Button, Card } from '../components/ui'`.

Nothing about the GitHub-dark visual identity changed — same palette, same
monospace-for-code convention — this is the same design language executed
with real depth (gradients, shadows, blur) and consistent components
instead of one-off `StyleSheet` blocks per screen.

### 3. Screens upgraded this pass

`LoginScreen`, `SettingsScreen`, `RepoListScreen`, `ActionsListScreen`,
`PullRequestListScreen`. Business logic in each is untouched — same state,
same API calls, same navigation params — only the render layer changed.

**Not yet upgraded** (same old plain-`StyleSheet` look, still fully
functional): `RepoDetailScreen`, `RepoSettingsScreen`, `FileEditorScreen`,
`GitToolsScreen`, `CodespacesScreen`, `TerminalScreen`, `RunDetailScreen`,
and the rest of the screens list. Next pass should work through these using
the same `src/components/ui` kit — the patterns in the five screens above
are the template to copy.

### 4. FCM (Firebase Cloud Messaging) — client side only

`@react-native-firebase/app` + `@react-native-firebase/messaging` replace
the remote-push gap that `expo-notifications` doesn't cover on its own
(that package still handles the *local* notifications the background task
fires — that's unchanged and still works standalone).

New: `src/services/fcm.js`

- `enablePushNotifications()` — requests permission, registers the device,
  fetches and stores the FCM token
- `disablePushNotifications()` — deletes the token, tears down listeners
- `initFcmListeners()` — foreground message handler (shows a local
  notification via the existing `notifications.js`) + token-refresh handler
- `registerBackgroundHandler()` — called at the very top of `index.js`,
  outside any component, so pushes are handled while the app is killed

Settings screen now has a "Push notifications (FCM)" card: toggle to
enable/disable, and — since there's no send-side yet — the raw device
token with a copy button so you can paste it into the Firebase console's
"Send test message" tool to verify delivery end-to-end.

**This does not send anything.** You said you'd handle the send side
later, so nothing was built to trigger pushes automatically (no Cloud
Function, no webhook receiver). When you're ready, whatever calls the FCM
HTTP v1 `send` endpoint with a device token from this app will just work —
no client changes needed.

## Setup required before this builds

1. Create a Firebase project → add an Android app with package name
   `com.zenas.gitmanager` (must match `android.package` in `app.json`).
2. Download `google-services.json` from the Firebase console and place it
   at the project root (next to `app.json`). It's `.gitignore`'d — don't
   commit it.
3. `npm install`
4. `npx expo prebuild --platform android --clean` (regenerates `android/`
   with the Firebase native config baked in)

Without `google-services.json` in place, prebuild will fail at the
`@react-native-firebase/app` config plugin step — that's expected, it's
telling you the file is missing, not that something is broken.

## Notes for the next pass

- `RepoDetailScreen` and `RepoSettingsScreen` are the next highest-value
  targets — they're the two biggest files and the ones people spend the
  most time on.
- `GlassPanel` is built but unused so far — good candidate for the
  `TerminalScreen` output panel or a redesigned bottom-sheet modal instead
  of the current flat `Modal` + `View` pattern used across the app.
- Consider swapping the remaining hand-rolled checkbox/toggle rows (still
  used in a few unconverted screens) for a shared `Toggle` component once
  more screens are converted — didn't add one yet since only `RepoListScreen`
  needed it this pass and it was folded into `Card` + `Ionicons` directly.
