import { detectProjectType, hasExistingWorkflow } from '../detectProjectType';

describe('detectProjectType', () => {
  it('detects a Node.js project via package.json and defaults to npm', () => {
    const result = detectProjectType(['package.json', 'src/index.js']);
    expect(result).not.toBeNull();
    expect(result.type).toBe('node');
    expect(result.packageManager).toBe('npm');
  });

  it('detects yarn as the package manager when yarn.lock is present', () => {
    const result = detectProjectType(['package.json', 'yarn.lock']);
    expect(result.packageManager).toBe('yarn');
  });

  it('detects pnpm as the package manager when pnpm-lock.yaml is present', () => {
    const result = detectProjectType(['package.json', 'pnpm-lock.yaml']);
    expect(result.packageManager).toBe('pnpm');
  });

  it('prefers npm when package-lock.json is present alongside package.json', () => {
    const result = detectProjectType(['package.json', 'package-lock.json']);
    expect(result.packageManager).toBe('npm');
  });

  it('detects a Python project via requirements.txt', () => {
    const result = detectProjectType(['requirements.txt', 'app.py']);
    expect(result.type).toBe('python');
  });

  it('detects a Python project via pyproject.toml', () => {
    const result = detectProjectType(['pyproject.toml']);
    expect(result.type).toBe('python');
    expect(result.detail).toMatch(/pyproject\.toml/);
  });

  it('detects a Go project via go.mod', () => {
    const result = detectProjectType(['go.mod', 'main.go']);
    expect(result.type).toBe('go');
  });

  it('detects a Rust project via Cargo.toml', () => {
    const result = detectProjectType(['Cargo.toml', 'src/main.rs']);
    expect(result.type).toBe('rust');
  });

  it('detects a Maven project via pom.xml', () => {
    const result = detectProjectType(['pom.xml']);
    expect(result.type).toBe('java-maven');
  });

  it('detects a Gradle project via build.gradle', () => {
    const result = detectProjectType(['build.gradle', 'app/src/main/AndroidManifest.xml']);
    expect(result.type).toBe('java-gradle');
  });

  it('detects a Gradle Kotlin DSL project via build.gradle.kts', () => {
    const result = detectProjectType(['build.gradle.kts']);
    expect(result.type).toBe('java-gradle');
  });

  it('detects a Ruby project via Gemfile', () => {
    const result = detectProjectType(['Gemfile', 'app.rb']);
    expect(result.type).toBe('ruby');
  });

  it('detects a PHP project via composer.json', () => {
    const result = detectProjectType(['composer.json']);
    expect(result.type).toBe('php');
  });

  it('detects a .NET project via a .csproj file at any depth', () => {
    const result = detectProjectType(['src/MyApp/MyApp.csproj']);
    expect(result.type).toBe('dotnet');
  });

  it('detects a .NET project via a .sln file', () => {
    const result = detectProjectType(['MySolution.sln']);
    expect(result.type).toBe('dotnet');
  });

  it('detects Docker via a Dockerfile when nothing more specific matches', () => {
    const result = detectProjectType(['Dockerfile', 'entrypoint.sh']);
    expect(result.type).toBe('docker');
  });

  it('prefers Node.js detection over Docker when both are present', () => {
    // package.json is checked before Dockerfile, matching how most
    // JS projects that also ship a Dockerfile still want a JS-flavored
    // build/test workflow rather than just a docker build step.
    const result = detectProjectType(['package.json', 'Dockerfile']);
    expect(result.type).toBe('node');
  });

  it('returns null when no recognizable project marker is present', () => {
    const result = detectProjectType(['README.md', 'LICENSE', 'notes.txt']);
    expect(result).toBeNull();
  });

  it('returns null for an empty file list', () => {
    expect(detectProjectType([])).toBeNull();
  });

  it('matches marker files nested in a subdirectory, not just at the root', () => {
    const result = detectProjectType(['backend/package.json', 'backend/src/index.js']);
    expect(result.type).toBe('node');
  });

  it('does not false-positive on a filename that merely contains a marker name', () => {
    // "mypackage.json.bak" should not be treated as package.json
    const result = detectProjectType(['mypackage.json.bak', 'notes.md']);
    expect(result).toBeNull();
  });
});

describe('hasExistingWorkflow', () => {
  it('detects a workflow yml file under .github/workflows at the root', () => {
    expect(hasExistingWorkflow(['.github/workflows/ci.yml', 'src/index.js'])).toBe(true);
  });

  it('detects a workflow yaml (not just yml) file', () => {
    expect(hasExistingWorkflow(['.github/workflows/build.yaml'])).toBe(true);
  });

  it('detects a workflow file nested under an upload subfolder prefix', () => {
    expect(hasExistingWorkflow(['myproject/.github/workflows/ci.yml'])).toBe(true);
  });

  it('is case-insensitive about the .yml/.yaml extension', () => {
    expect(hasExistingWorkflow(['.github/workflows/CI.YML'])).toBe(true);
  });

  it('returns false when there is no .github/workflows directory at all', () => {
    expect(hasExistingWorkflow(['src/index.js', 'package.json', 'README.md'])).toBe(false);
  });

  it('returns false for files inside .github but not inside workflows', () => {
    expect(hasExistingWorkflow(['.github/ISSUE_TEMPLATE.md', '.github/CODEOWNERS'])).toBe(false);
  });

  it('returns false for an empty file list', () => {
    expect(hasExistingWorkflow([])).toBe(false);
  });
});
