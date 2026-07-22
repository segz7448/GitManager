/**
 * A minimal .gitignore pattern matcher, covering the common real-world
 * subset: comments (#), blank lines, negation (!), directory-only
 * patterns (trailing /), anchored patterns (leading /), and glob
 * wildcards (* and **). It does not implement the full gitignore spec
 * (character classes like [abc], escaped special characters, etc.) -
 * for the purpose this serves (warning before a bulk commit, not being
 * a git implementation), covering the common cases well is the right
 * tradeoff over exhaustive correctness.
 */

function globToRegex(pattern) {
  let re = '';
  let i = 0;
  while (i < pattern.length) {
    const c = pattern[i];
    if (c === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 3;
          continue;
        }
        re += '.*';
        i += 2;
        continue;
      }
      re += '[^/]*';
      i += 1;
      continue;
    }
    if (c === '?') {
      re += '[^/]';
      i += 1;
      continue;
    }
    if ('.+^${}()|[]\\'.includes(c)) {
      re += `\\${c}`;
      i += 1;
      continue;
    }
    re += c;
    i += 1;
  }
  return re;
}

/**
 * Parses raw .gitignore file content into an ordered list of compiled
 * rules. Order matters for gitignore semantics - later rules (including
 * negations) override earlier ones for the same path.
 */
export function parseGitignore(content) {
  const lines = content.split('\n');
  const rules = [];

  for (let raw of lines) {
    let line = raw.replace(/\r$/, '');
    if (!line.trim() || line.trim().startsWith('#')) continue;

    let negate = false;
    if (line.startsWith('!')) {
      negate = true;
      line = line.slice(1);
    }

    let dirOnly = false;
    if (line.endsWith('/')) {
      dirOnly = true;
      line = line.slice(0, -1);
    }

    let anchored = false;
    if (line.startsWith('/')) {
      anchored = true;
      line = line.slice(1);
    }
    if (line.includes('/')) anchored = true;

    const regexBody = globToRegex(line);
    const fullRegex = anchored
      ? new RegExp(`^${regexBody}${dirOnly ? '(?:/.*)?$' : '$'}`)
      : new RegExp(`(^|/)${regexBody}${dirOnly ? '(?:/.*)?$' : '$'}`);

    rules.push({ regex: fullRegex, negate });
  }

  return rules;
}

/**
 * Returns true if `path` (forward-slash separated, no leading slash)
 * should be ignored according to the given compiled ruleset. Later
 * matching rules win, and a negation rule can un-ignore a path matched
 * by an earlier broader rule - this mirrors git's own precedence.
 */
export function isIgnored(path, rules) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.regex.test(path)) {
      ignored = !rule.negate;
    }
  }
  return ignored;
}

/**
 * A small built-in default ignore list applied even when no .gitignore
 * is present in the upload, covering the most common accidental-commit
 * offenders (dependency directories, OS/editor cruft, env files). This
 * is intentionally conservative - it only catches extremely well-known
 * patterns, not project-specific build output, so it won't surprise
 * anyone by hiding something they actually wanted to upload.
 */
export const DEFAULT_IGNORE_PATTERNS = [
  'node_modules/',
  '.git/',
  '.DS_Store',
  'Thumbs.db',
  '.env',
  '.env.local',
  '*.log',
  '__pycache__/',
  '.venv/',
  'venv/',
];

export function getDefaultRules() {
  return parseGitignore(DEFAULT_IGNORE_PATTERNS.join('\n'));
}

/**
 * Filters a list of {path, ...} entries against a .gitignore's content
 * (if provided) plus the built-in defaults, returning both the kept and
 * ignored entries so the UI can show what was excluded and let the user
 * override if needed.
 */
export function filterIgnoredEntries(entries, gitignoreContent) {
  const rules = gitignoreContent
    ? [...getDefaultRules(), ...parseGitignore(gitignoreContent)]
    : getDefaultRules();

  const kept = [];
  const ignored = [];
  for (const entry of entries) {
    if (isIgnored(entry.path, rules)) {
      ignored.push(entry);
    } else {
      kept.push(entry);
    }
  }
  return { kept, ignored };
}
