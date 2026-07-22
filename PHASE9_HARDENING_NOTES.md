# Tests, Rate Limits, .gitignore Awareness, Branch Protection, Webhooks, Error Boundary

This round covered every item from the "what's still missing" list, after first
re-checking the codebase to make sure nothing was already there. Two items I'd
previously flagged as missing turned out to already be fully built and wired up:
PR creation (CreatePullRequestScreen, reachable from the PR list) and
GitHub Releases (ReleasesListScreen/CreateReleaseScreen/ReleaseDetailScreen,
reachable from the repo screen) - so no work was needed there, and I didn't touch
them to avoid duplicating working code.

## Tests

Added jest + jest-expo as dev dependencies and a test script (npm test).
Important honesty note: this sandbox has no network access, so I could not run
npm install or actually execute these tests here - I traced every test by hand
against the real implementation it covers, but they should be run via
npm install && npm test on a real machine before being trusted. If anything
doesn't pass, it's most likely a mismatch I couldn't catch without execution
that would want a small fix, not a sign the underlying feature is broken.

Coverage focused on the highest-risk code - the parts that force-move branches,
rewrite git trees, or delete/transfer repositories:
- src/services/__tests__/github.safety.test.js - cherry-pick's guard against
  deleting a path that no longer exists on the destination branch, revert's
  "build on the current tip, not the reverted commit" logic, undo's refusal to
  proceed if the branch moved since the expected tip, and the exact request
  shape sent for delete/transfer/rename.
- src/workflows/__tests__/ - project-type detection and YAML generation
  (pure functions, no mocking needed) - including a regression test that
  guards against the Rust template ever drifting back to the archived
  actions-rs/toolchain action.
- src/db/__tests__/fileBackups.test.js - the "don't create a duplicate open
  backup for identical content" dedup logic.
- src/utils/__tests__/gitignoreMatcher.test.js - the pattern matcher's
  anchoring, wildcards, and negation-precedence rules.

I deliberately did NOT write a general-purpose fake SQL engine to test the
rest of the db/ layer - a hand-rolled SQL parser is itself a bug risk I can't
verify by running it, so I kept db-layer tests scoped to logic I could mock
surgically and trace by hand with confidence.

## Rate limit visibility

src/services/rateLimitTracker.js captures GitHub's x-ratelimit-limit /
-remaining / -reset / -resource headers from every request (success or
error - a 403 from hitting the limit is exactly when this matters most) and
exposes a subscribable store. RateLimitIndicator.js shows current usage with
a progress bar, turning red and showing a reset-time estimate once usage drops
to 10% or below (matching GitHub's own dashboard convention). Wired into the
Security screen, next to token info.

## .gitignore awareness on bulk upload

src/utils/gitignoreMatcher.js is a from-scratch, dependency-free .gitignore
pattern matcher covering the common real-world subset (comments, negation,
anchored/unanchored patterns, */** wildcards) - not the full spec (no
character classes like [abc]), which is the right tradeoff for "warn before
a bulk commit" rather than reimplementing git itself.

Wired into ZipUploadScreen: after extraction, it looks for a .gitignore in
the zip and combines it with a small built-in default list (node_modules/,
.git/, .DS_Store, .env, *.log, etc.) that applies even without a
project .gitignore. Matched files are excluded from the commit by default,
shown in a dismissible list, with an explicit "include anyway" override
checkbox - nothing is silently hidden or deleted, just excluded from what gets
pushed unless you say otherwise.

## Codespace machine type selection

GitToolsScreen's "Create a codespace" now fetches the repo's available
machine types first (listCodespaceMachines) and shows a picker (including a
"Default - let GitHub choose" option) before creating. If fetching machine
types fails for any reason, it falls back to offering creation with GitHub's
default rather than blocking the whole feature on that one call.

## Branch protection rules

New section in Repo Settings, scoped to the repo's default branch (the
overwhelmingly common case - a full arbitrary-branch picker felt like scope
creep for this pass). Covers: require pull request reviews before merging
(with an approval-count picker), require status checks to pass, and enforce
the same rules for administrators. Reading existing settings correctly
accounts for a real GitHub API asymmetry: enforce_admins is a plain boolean
on write but {enabled: bool} on read.

This simplified UI doesn't include a required-status-check-context picker (an
additional API call and a UI of its own) - if a repo already has specific
required contexts configured, saving here preserves them as-is rather than
clearing them just because this screen doesn't let you edit them yet.

## Webhook management

New section in the GitHub Management screen: list, add (URL + optional
secret), ping (to verify reachability without waiting for a real event), and
delete. Kept to the single most common use case (JSON payload on push) rather
than exposing GitHub's full event-type matrix, which would be a lot of UI for
a feature most people configure once and rarely touch again.

## Error boundary

src/components/ErrorBoundary.js, wrapping the whole app in App.js. This is
a single top-level boundary, not one per screen - per-screen boundaries would
mean touching every screen's navigator registration individually, and a single
top-level catch already delivers the meaningful improvement: an unexpected
render-time crash now shows a "Something went wrong / Try Again" screen
instead of a white screen or a full app crash. Event-handler and async errors
were already individually caught via try/catch + Alert.alert throughout the
app before this - this specifically covers the gap that wasn't handled
anywhere: crashes during render itself.

## Files changed
- package.json - jest/jest-expo devDependencies, test script, jest config
- App.js - ErrorBoundary wrapping
- src/services/github.js - rate limit header capture wired into all three
  request helpers; branch protection and webhook API functions added
- src/screens/GitToolsScreen.js - codespace machine picker
- src/screens/ZipUploadScreen.js - gitignore filtering UI and logic
- src/screens/RepoSettingsScreen.js - branch protection section
- src/screens/RepoGitHubScreen.js - webhooks section
- src/screens/SecurityScreen.js - rate limit indicator

## Files added
- src/services/rateLimitTracker.js, src/components/RateLimitIndicator.js
- src/utils/gitignoreMatcher.js
- src/components/ErrorBoundary.js
- Test files under src/services/__tests__/, src/workflows/__tests__/,
  src/db/__tests__/, src/utils/__tests__/

## Honest limitations
- Tests are written but unexecuted in this environment (no network access to
  install dependencies) - run npm install && npm test to confirm before
  relying on them.
- Branch protection UI targets the default branch only, and doesn't expose a
  status-check-context picker.
- Webhook UI only covers push-JSON webhooks, not the full event matrix.
- The error boundary is app-wide, not per-screen - a crash still loses
  whatever screen you were on, but no longer takes down the whole app.
