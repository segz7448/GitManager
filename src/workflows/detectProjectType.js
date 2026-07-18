/**
 * Detects a project's type from a flat list of file paths (works for
 * either a zip's contents or a repo's tree listing) so the app can
 * suggest a matching GitHub Actions workflow when one doesn't already
 * exist. This is intentionally simple, manifest-based detection - it
 * doesn't parse build files deeply, just recognizes which ecosystem's
 * marker file is present and picks reasonable defaults.
 *
 * `paths` should be an array of path strings (forward-slash separated).
 */

function hasFile(paths, name) {
  return paths.some((p) => p === name || p.endsWith(`/${name}`));
}

function hasAnyFile(paths, names) {
  return names.some((n) => hasFile(paths, n));
}

function hasExtension(paths, ext) {
  return paths.some((p) => p.toLowerCase().endsWith(ext));
}

/**
 * Returns null if nothing recognizable was found, otherwise
 * { type, label, detail } describing what was detected. Checks are
 * ordered roughly by specificity.
 */
export function detectProjectType(paths) {
  if (hasFile(paths, 'package.json')) {
    let packageManager = 'npm';
    if (hasFile(paths, 'pnpm-lock.yaml')) packageManager = 'pnpm';
    else if (hasFile(paths, 'yarn.lock')) packageManager = 'yarn';
    else if (hasFile(paths, 'package-lock.json')) packageManager = 'npm';

    return {
      type: 'node',
      label: 'Node.js',
      detail: `Detected package.json (${packageManager})`,
      packageManager,
    };
  }

  if (hasFile(paths, 'requirements.txt') || hasFile(paths, 'pyproject.toml') || hasFile(paths, 'setup.py')) {
    return {
      type: 'python',
      label: 'Python',
      detail: hasFile(paths, 'pyproject.toml')
        ? 'Detected pyproject.toml'
        : hasFile(paths, 'requirements.txt')
        ? 'Detected requirements.txt'
        : 'Detected setup.py',
    };
  }

  if (hasFile(paths, 'go.mod')) {
    return { type: 'go', label: 'Go', detail: 'Detected go.mod' };
  }

  if (hasFile(paths, 'Cargo.toml')) {
    return { type: 'rust', label: 'Rust', detail: 'Detected Cargo.toml' };
  }

  if (hasFile(paths, 'pom.xml')) {
    return { type: 'java-maven', label: 'Java (Maven)', detail: 'Detected pom.xml' };
  }

  if (hasAnyFile(paths, ['build.gradle', 'build.gradle.kts'])) {
    return { type: 'java-gradle', label: 'Java/Kotlin (Gradle)', detail: 'Detected build.gradle' };
  }

  if (hasFile(paths, 'Gemfile')) {
    return { type: 'ruby', label: 'Ruby', detail: 'Detected Gemfile' };
  }

  if (hasFile(paths, 'composer.json')) {
    return { type: 'php', label: 'PHP', detail: 'Detected composer.json' };
  }

  if (hasExtension(paths, '.csproj') || hasExtension(paths, '.sln')) {
    return { type: 'dotnet', label: '.NET', detail: 'Detected .csproj/.sln' };
  }

  if (hasFile(paths, 'Dockerfile')) {
    return { type: 'docker', label: 'Docker', detail: 'Detected Dockerfile' };
  }

  return null;
}

/**
 * Checks whether a set of paths already includes a workflow file under
 * .github/workflows/ - if so, we should never suggest overwriting it.
 */
export function hasExistingWorkflow(paths) {
  return paths.some((p) => /(^|\/)\.github\/workflows\/.+\.ya?ml$/i.test(p));
}
