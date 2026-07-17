/**
 * Error pattern library for parsing GitHub Actions raw logs.
 * Each pattern: { id, regex, category, severity, explain(match, context) }
 *
 * explain() returns { title, cause, fix } - plain English.
 * Patterns are checked in order; first match per line wins to avoid noise.
 */

const PATTERNS = [
  // ---------- Kotlin / Android / Gradle ----------
  {
    id: 'kotlin-unresolved-reference',
    regex: /error:\s*unresolved reference:\s*(\S+)/i,
    category: 'Kotlin',
    explain: (m) => ({
      title: `Unresolved reference: ${m[1]}`,
      cause: `Kotlin can't find "${m[1]}" — it's either an unimported class/package, a missing dependency in build.gradle, or a typo.`,
      fix: `Check that the module providing "${m[1]}" is listed in your app-level build.gradle dependencies, and that you have the correct import statement at the top of the file.`,
    }),
  },
  {
    id: 'kotlin-type-mismatch',
    regex: /error:\s*type mismatch:\s*inferred type is (.+?) but (.+?) was expected/i,
    category: 'Kotlin',
    explain: (m) => ({
      title: 'Kotlin type mismatch',
      cause: `Found type "${m[1].trim()}" where "${m[2].trim()}" was expected.`,
      fix: `Cast or convert the value explicitly, or check if you're passing the wrong variable/return type into a function.`,
    }),
  },
  {
    id: 'gradle-manifest-merge',
    regex: /Manifest merger failed.*?:\s*(.+)/i,
    category: 'Android Manifest',
    explain: (m) => ({
      title: 'AndroidManifest merge conflict',
      cause: `Two manifests (likely your app's and a library's) declare conflicting attributes: ${m[1].trim()}`,
      fix: `Add a tools:replace or tools:node="merge" override on the conflicting attribute in your AndroidManifest.xml, matching what the error names.`,
    }),
  },
  {
    id: 'gradle-duplicate-class',
    regex: /Duplicate class (\S+) found in modules (.+)/i,
    category: 'Gradle',
    explain: (m) => ({
      title: `Duplicate class: ${m[1]}`,
      cause: `The class ${m[1]} exists in more than one dependency: ${m[2]}`,
      fix: `Exclude the duplicate transitive dependency in build.gradle (using exclude group/module) so only one copy is packaged.`,
    }),
  },
  {
    id: 'gradle-task-failed',
    regex: /Execution failed for task '([^']+)'/i,
    category: 'Gradle',
    explain: (m) => ({
      title: `Gradle task failed: ${m[1]}`,
      cause: `The build step "${m[1]}" threw an error. Look at the lines directly above this for the underlying cause (compile error, missing resource, etc.).`,
      fix: `Scroll up in the raw log from this line — Gradle prints the real root cause just before this summary line.`,
    }),
  },
  {
    id: 'gradle-daemon-oom',
    regex: /(OutOfMemoryError|Java heap space)/i,
    category: 'Gradle',
    explain: () => ({
      title: 'Gradle/JVM ran out of memory',
      cause: 'The build process exceeded the JVM heap size configured for Gradle.',
      fix: `Increase heap size in gradle.properties: org.gradle.jvmargs=-Xmx4096m, or reduce parallel workers in CI.`,
    }),
  },
  {
    id: 'android-sdk-missing',
    regex: /Failed to find (Build Tools|target) (.+?) /i,
    category: 'Android SDK',
    explain: (m) => ({
      title: `Missing Android ${m[1]}: ${m[2]}`,
      cause: `The CI runner doesn't have the requested Android ${m[1]} version installed.`,
      fix: `Add an sdkmanager install step in your workflow before the build step, or align compileSdkVersion/buildToolsVersion with what's available on the runner image.`,
    }),
  },

  // ---------- Node / npm / Expo ----------
  {
    id: 'npm-module-not-found',
    regex: /Cannot find module '([^']+)'/i,
    category: 'Node/npm',
    explain: (m) => ({
      title: `Module not found: ${m[1]}`,
      cause: `The package "${m[1]}" isn't installed, or wasn't installed before this step ran.`,
      fix: `Add "${m[1]}" to package.json dependencies and make sure "npm install" (or "npm ci") runs before this step in your workflow.`,
    }),
  },
  {
    id: 'npm-peer-dep-conflict',
    regex: /ERESOLVE unable to resolve dependency tree/i,
    category: 'Node/npm',
    explain: () => ({
      title: 'npm dependency resolution conflict',
      cause: 'Two packages require incompatible versions of the same peer dependency.',
      fix: `Run "npm install --legacy-peer-deps" in CI, or pin the conflicting package to a compatible version shown further down in the log.`,
    }),
  },
  {
    id: 'expo-prebuild-plugin-error',
    regex: /\[expo-cli\]\s*(.*plugin.*failed.*)/i,
    category: 'Expo Prebuild',
    explain: (m) => ({
      title: 'Expo config plugin failed during prebuild',
      cause: m[1] || 'One of the Expo config plugins threw during the prebuild step.',
      fix: `Check the plugin's required native config in app.json — a common cause is a missing permission or a plugin expecting a value that wasn't provided.`,
    }),
  },
  {
    id: 'metro-resolution',
    regex: /Unable to resolve module `?([^`\s]+)`?/i,
    category: 'Metro/Bundler',
    explain: (m) => ({
      title: `Metro couldn't resolve: ${m[1]}`,
      cause: `The import path "${m[1]}" doesn't match any installed package or existing file.`,
      fix: `Check the import spelling/path, confirm the package is installed, and clear the Metro cache if it was recently added ("npx expo start -c" locally, or a fresh checkout in CI).`,
    }),
  },

  // ---------- Java / Signing ----------
  {
    id: 'keystore-not-found-for-signing-config',
    regex: /Keystore file '(.+?)' not found for signing config '(.+?)'/i,
    category: 'Signing',
    explain: (m) => ({
      title: `Keystore not found for '${m[2]}' signing config`,
      cause: `Gradle expected a keystore at ${m[1]} but it doesn't exist. This usually means the "Decode release keystore" CI step was skipped (no RELEASE_KEYSTORE_BASE64 secret set) or ran before this path existed.`,
      fix: `Either add the RELEASE_KEYSTORE_BASE64/RELEASE_STORE_PASSWORD/RELEASE_KEY_ALIAS/RELEASE_KEY_PASSWORD secrets to the repo, or confirm the signing config plugin falls back to the debug keystore when no real keystore file is present.`,
    }),
  },
  {
    id: 'keystore-missing',
    regex: /(Keystore file .* not found|Failed to read key .* from store)/i,
    category: 'Signing',
    explain: () => ({
      title: 'Signing keystore missing or unreadable',
      cause: 'The release keystore file referenced in build.gradle is missing, or the CI secret for it is empty/misconfigured.',
      fix: `Confirm the keystore is decoded/written to disk in an earlier CI step, and that the GitHub secret for the keystore base64 and passwords are correctly referenced.`,
    }),
  },

  // ---------- General ----------
  {
    id: 'permission-denied',
    regex: /Permission denied.*?(\/[^\s]+)/i,
    category: 'Shell',
    explain: (m) => ({
      title: `Permission denied: ${m[1]}`,
      cause: `The workflow doesn't have execute permission on ${m[1]} (common with gradlew after checkout).`,
      fix: `Add "chmod +x ${m[1]}" as a step before it's invoked.`,
    }),
  },
  {
    id: 'timeout',
    regex: /(The operation was canceled|Error: The action .* has timed out)/i,
    category: 'CI Runner',
    explain: () => ({
      title: 'Job timed out or was canceled',
      cause: 'The job exceeded its allotted time, or was manually canceled.',
      fix: `Increase the "timeout-minutes" setting on the job, or split long-running steps (e.g. cache dependencies to speed up repeat runs).`,
    }),
  },
];

/**
 * Scan raw log text and return a list of found issues.
 * Each error is tagged with the CI step (GitHub Actions ##[group] block)
 * it occurred in, determined from the actual ##[group]/##[endgroup]
 * markers GitHub embeds in raw logs - not guessed from indentation.
 * Returns: [{ id, category, line, lineNumber, step, title, cause, fix }]
 */
export function parseLogErrors(rawLogText) {
  if (!rawLogText) return [];
  const lines = rawLogText.split('\n');
  const results = [];
  const seen = new Set();
  let currentStep = null;

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    // Strip GitHub's ISO timestamp prefix so pattern regexes (and step
    // name extraction) don't have to account for it.
    const line = rawLine.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '');

    const groupMatch = line.match(/^##\[group\](.+)$/);
    if (groupMatch) {
      currentStep = groupMatch[1].trim();
      continue;
    }
    if (/^##\[endgroup\]/.test(line)) {
      continue; // keep currentStep - GitHub doesn't always close cleanly
    }

    for (const pattern of PATTERNS) {
      const match = line.match(pattern.regex);
      if (match) {
        const info = pattern.explain(match, { lines, index: i });
        const dedupeKey = `${pattern.id}:${info.title}`;
        if (seen.has(dedupeKey)) continue; // avoid repeating same error many times
        seen.add(dedupeKey);
        results.push({
          id: pattern.id,
          category: pattern.category,
          line: line.trim(),
          lineNumber: i + 1,
          step: currentStep,
          ...info,
        });
        break; // one pattern match per line is enough
      }
    }
  }

  return results;
}

/**
 * Fallback for failures that don't match any known PATTERN: finds the
 * step whose group contains the build's terminal failure line (e.g.
 * "FAILURE: Build failed", "npm ERR!", a non-zero exit) and returns a
 * short snippet around it. Used so the UI can still point at *something*
 * useful even when the specific error text isn't in our pattern library.
 */
const TERMINAL_FAILURE_MARKERS = [
  /FAILURE: Build failed/i,
  /^npm ERR!/,
  /Execution failed for task/i,
  /##\[error\]/i,
  /Process completed with exit code [1-9]/i,
];

export function findFailingStep(rawLogText) {
  if (!rawLogText) return null;
  const lines = rawLogText.split('\n');
  let currentStep = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, '');

    const groupMatch = line.match(/^##\[group\](.+)$/);
    if (groupMatch) {
      currentStep = groupMatch[1].trim();
      continue;
    }

    if (TERMINAL_FAILURE_MARKERS.some((re) => re.test(line))) {
      const snippetStart = Math.max(0, i - 2);
      const snippetEnd = Math.min(lines.length, i + 3);
      const snippet = lines
        .slice(snippetStart, snippetEnd)
        .map((l) => l.replace(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z\s*/, ''))
        .join('\n');
      return { step: currentStep, lineNumber: i + 1, snippet };
    }
  }

  return null;
}

/**
 * Quick heuristic: does this log look like it failed at all?
 * Useful for showing a summary badge without full parse.
 */
export function logLooksFailed(rawLogText) {
  if (!rawLogText) return false;
  return /(error|failed|failure|exception)/i.test(rawLogText);
}

export { PATTERNS };
