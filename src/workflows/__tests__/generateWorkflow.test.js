import { generateWorkflowYaml } from '../generateWorkflow';

describe('generateWorkflowYaml', () => {
  it('generates a Node.js workflow using npm ci when packageManager is npm', () => {
    const yaml = generateWorkflowYaml({ type: 'node', packageManager: 'npm' });
    expect(yaml).toContain('npm ci');
    expect(yaml).toContain("cache: 'npm'");
    expect(yaml).toContain('actions/setup-node@v4');
    expect(yaml).toContain('actions/checkout@v4');
  });

  it('generates a Node.js workflow using yarn commands when packageManager is yarn', () => {
    const yaml = generateWorkflowYaml({ type: 'node', packageManager: 'yarn' });
    expect(yaml).toContain('yarn install --frozen-lockfile');
    expect(yaml).toContain('yarn build --if-present');
    expect(yaml).toContain('yarn test --if-present');
  });

  it('generates a Node.js workflow with a pnpm setup step when packageManager is pnpm', () => {
    const yaml = generateWorkflowYaml({ type: 'node', packageManager: 'pnpm' });
    expect(yaml).toContain('pnpm/action-setup@v4');
    expect(yaml).toContain('pnpm install --frozen-lockfile');
  });

  it('generates a Python workflow with setup-python and pip', () => {
    const yaml = generateWorkflowYaml({ type: 'python' });
    expect(yaml).toContain('actions/setup-python@v5');
    expect(yaml).toContain('pip install');
  });

  it('generates a Go workflow with setup-go', () => {
    const yaml = generateWorkflowYaml({ type: 'go' });
    expect(yaml).toContain('actions/setup-go@v5');
    expect(yaml).toContain('go build ./...');
    expect(yaml).toContain('go test ./...');
  });

  it('generates a Rust workflow using the current maintained toolchain action, not the archived one', () => {
    const yaml = generateWorkflowYaml({ type: 'rust' });
    expect(yaml).toContain('dtolnay/rust-toolchain');
    expect(yaml).not.toContain('actions-rs/toolchain');
  });

  it('generates a Maven workflow', () => {
    const yaml = generateWorkflowYaml({ type: 'java-maven' });
    expect(yaml).toContain('actions/setup-java@v4');
    expect(yaml).toContain('mvn -B verify');
  });

  it('generates a Gradle workflow that makes gradlew executable before running it', () => {
    const yaml = generateWorkflowYaml({ type: 'java-gradle' });
    expect(yaml).toContain('chmod +x gradlew');
    expect(yaml).toContain('./gradlew build');
  });

  it('generates a Ruby workflow with setup-ruby', () => {
    const yaml = generateWorkflowYaml({ type: 'ruby' });
    expect(yaml).toContain('ruby/setup-ruby@v1');
  });

  it('generates a PHP workflow with setup-php', () => {
    const yaml = generateWorkflowYaml({ type: 'php' });
    expect(yaml).toContain('shivammathur/setup-php@v2');
    expect(yaml).toContain('composer install');
  });

  it('generates a .NET workflow with setup-dotnet', () => {
    const yaml = generateWorkflowYaml({ type: 'dotnet' });
    expect(yaml).toContain('actions/setup-dotnet@v4');
    expect(yaml).toContain('dotnet build');
    expect(yaml).toContain('dotnet test');
  });

  it('generates a Docker workflow that builds the image', () => {
    const yaml = generateWorkflowYaml({ type: 'docker' });
    expect(yaml).toContain('docker build');
  });

  it('returns null for an unrecognized project type instead of throwing', () => {
    expect(generateWorkflowYaml({ type: 'cobol-mainframe' })).toBeNull();
  });

  it('always triggers on push and pull_request to main, for every generated workflow', () => {
    const types = ['node', 'python', 'go', 'rust', 'java-maven', 'java-gradle', 'ruby', 'php', 'dotnet', 'docker'];
    for (const type of types) {
      const yaml = generateWorkflowYaml({ type, packageManager: 'npm' });
      expect(yaml).toContain('branches: [main]');
      expect(yaml).toContain('pull_request:');
    }
  });

  it('always starts with a name field so GitHub Actions shows a readable workflow name', () => {
    const yaml = generateWorkflowYaml({ type: 'python' });
    expect(yaml.trim().startsWith('name:')).toBe(true);
  });
});
