import { parseGitignore, isIgnored, filterIgnoredEntries, DEFAULT_IGNORE_PATTERNS } from '../gitignoreMatcher';

describe('parseGitignore + isIgnored', () => {
  it('matches an unanchored directory pattern anywhere in the tree', () => {
    const rules = parseGitignore('node_modules/');
    expect(isIgnored('node_modules', rules)).toBe(true);
    expect(isIgnored('node_modules/pkg/index.js', rules)).toBe(true);
    expect(isIgnored('src/node_modules/pkg/index.js', rules)).toBe(true);
  });

  it('does not match a filename that merely contains the pattern as a substring', () => {
    const rules = parseGitignore('node_modules/');
    expect(isIgnored('my-node_modules-thing.js', rules)).toBe(false);
  });

  it('matches a wildcard extension pattern anywhere in the tree', () => {
    const rules = parseGitignore('*.log');
    expect(isIgnored('app.log', rules)).toBe(true);
    expect(isIgnored('logs/app.log', rules)).toBe(true);
    expect(isIgnored('app.log.bak', rules)).toBe(false);
    expect(isIgnored('app.logger', rules)).toBe(false);
  });

  it('anchors a pattern with a leading slash to the root only', () => {
    const rules = parseGitignore('/build');
    expect(isIgnored('build', rules)).toBe(true);
    expect(isIgnored('build/output.js', rules)).toBe(true);
    expect(isIgnored('src/build', rules)).toBe(false);
  });

  it('treats any pattern containing an internal slash as anchored to the root', () => {
    const rules = parseGitignore('config/local.json');
    expect(isIgnored('config/local.json', rules)).toBe(true);
    expect(isIgnored('src/config/local.json', rules)).toBe(false);
  });

  it('ignores comment lines and blank lines', () => {
    const rules = parseGitignore('# a comment\n\nnode_modules/\n');
    expect(rules.length).toBe(1);
    expect(isIgnored('node_modules', rules)).toBe(true);
  });

  it('supports ** to match across directory boundaries', () => {
    const rules = parseGitignore('**/dist');
    expect(isIgnored('dist', rules)).toBe(true);
    expect(isIgnored('packages/app/dist', rules)).toBe(true);
  });

  it('lets a later negation rule un-ignore a path matched by an earlier rule', () => {
    const rules = parseGitignore('*.log\n!important.log');
    expect(isIgnored('debug.log', rules)).toBe(true);
    expect(isIgnored('important.log', rules)).toBe(false);
  });

  it('respects rule order - an ignore rule after a negation re-ignores the path', () => {
    const rules = parseGitignore('!keep.log\n*.log');
    expect(isIgnored('keep.log', rules)).toBe(true);
  });

  it('matches exact filenames like .env without matching similarly-prefixed files', () => {
    const rules = parseGitignore('.env');
    expect(isIgnored('.env', rules)).toBe(true);
    expect(isIgnored('config/.env', rules)).toBe(true);
    expect(isIgnored('.env.local', rules)).toBe(false);
  });
});

describe('filterIgnoredEntries', () => {
  it('applies built-in defaults even with no .gitignore content provided', () => {
    const entries = [
      { path: 'src/index.js' },
      { path: 'node_modules/pkg/index.js' },
      { path: '.env' },
      { path: '.DS_Store' },
    ];
    const { kept, ignored } = filterIgnoredEntries(entries, null);
    expect(kept.map((e) => e.path)).toEqual(['src/index.js']);
    expect(ignored.map((e) => e.path).sort()).toEqual(['.DS_Store', '.env', 'node_modules/pkg/index.js']);
  });

  it('combines built-in defaults with a provided .gitignore', () => {
    const entries = [
      { path: 'src/index.js' },
      { path: 'node_modules/pkg/index.js' },
      { path: 'build/output.js' },
    ];
    const { kept, ignored } = filterIgnoredEntries(entries, '/build');
    expect(kept.map((e) => e.path)).toEqual(['src/index.js']);
    expect(ignored.map((e) => e.path).sort()).toEqual(['build/output.js', 'node_modules/pkg/index.js']);
  });

  it('lets a project .gitignore negation override a built-in default', () => {
    const entries = [{ path: 'node_modules/keep-this/index.js' }];
    const { kept, ignored } = filterIgnoredEntries(entries, '!node_modules/keep-this/**');
    expect(kept.map((e) => e.path)).toEqual(['node_modules/keep-this/index.js']);
    expect(ignored).toEqual([]);
  });

  it('keeps everything when the entry list is empty', () => {
    const { kept, ignored } = filterIgnoredEntries([], null);
    expect(kept).toEqual([]);
    expect(ignored).toEqual([]);
  });
});

describe('DEFAULT_IGNORE_PATTERNS', () => {
  it('is a non-empty list of plain strings', () => {
    expect(Array.isArray(DEFAULT_IGNORE_PATTERNS)).toBe(true);
    expect(DEFAULT_IGNORE_PATTERNS.length).toBeGreaterThan(0);
    DEFAULT_IGNORE_PATTERNS.forEach((p) => expect(typeof p).toBe('string'));
  });
});
