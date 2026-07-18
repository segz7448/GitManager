/**
 * Generates a reasonable starter GitHub Actions workflow for a detected
 * project type. These are intentionally minimal, generic CI templates
 * (checkout -> setup toolchain -> install -> build/test) meant as a
 * working starting point, not a tuned production pipeline - the user
 * should expect to adjust versions, add caching keys, matrix builds,
 * deployment steps, etc. for their specific project.
 */

function nodeWorkflow(packageManager) {
  const installCmd =
    packageManager === 'pnpm' ? 'pnpm install --frozen-lockfile'
    : packageManager === 'yarn' ? 'yarn install --frozen-lockfile'
    : 'npm ci';
  const buildCmd =
    packageManager === 'pnpm' ? 'pnpm run build --if-present'
    : packageManager === 'yarn' ? 'yarn build --if-present'
    : 'npm run build --if-present';
  const testCmd =
    packageManager === 'pnpm' ? 'pnpm test --if-present'
    : packageManager === 'yarn' ? 'yarn test --if-present'
    : 'npm test --if-present';

  const setupStep =
    packageManager === 'pnpm'
      ? `      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 9
      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'pnpm'`
      : `      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: '${packageManager}'`;

  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
${setupStep}
      - name: Install dependencies
        run: ${installCmd}
      - name: Build
        run: ${buildCmd}
      - name: Test
        run: ${testCmd}
`;
}

function pythonWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Python
        uses: actions/setup-python@v5
        with:
          python-version: '3.12'
          cache: 'pip'
      - name: Install dependencies
        run: |
          python -m pip install --upgrade pip
          if [ -f requirements.txt ]; then pip install -r requirements.txt; fi
          if [ -f pyproject.toml ]; then pip install .; fi
      - name: Test
        run: |
          if [ -f pytest.ini ] || [ -d tests ]; then pip install pytest && pytest; else echo "No tests found, skipping"; fi
`;
}

function goWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Go
        uses: actions/setup-go@v5
        with:
          go-version: 'stable'
          cache: true
      - name: Build
        run: go build ./...
      - name: Test
        run: go test ./...
`;
}

function rustWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Rust
        uses: dtolnay/rust-toolchain@stable
      - name: Build
        run: cargo build --verbose
      - name: Test
        run: cargo test --verbose
`;
}

function javaMavenWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'maven'
      - name: Build and test
        run: mvn -B verify
`;
}

function javaGradleWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup JDK
        uses: actions/setup-java@v4
        with:
          java-version: '21'
          distribution: 'temurin'
          cache: 'gradle'
      - name: Grant execute permission for gradlew
        run: chmod +x gradlew
      - name: Build and test
        run: ./gradlew build
`;
}

function rubyWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup Ruby
        uses: ruby/setup-ruby@v1
        with:
          ruby-version: '3.3'
          bundler-cache: true
      - name: Run tests
        run: |
          if [ -f Rakefile ]; then bundle exec rake test; else echo "No Rakefile found, skipping"; fi
`;
}

function phpWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup PHP
        uses: shivammathur/setup-php@v2
        with:
          php-version: '8.3'
      - name: Install dependencies
        run: composer install --prefer-dist --no-progress
      - name: Run tests
        run: |
          if [ -f vendor/bin/phpunit ]; then vendor/bin/phpunit; else echo "No PHPUnit found, skipping"; fi
`;
}

function dotnetWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Setup .NET
        uses: actions/setup-dotnet@v4
        with:
          dotnet-version: '8.0.x'
      - name: Restore dependencies
        run: dotnet restore
      - name: Build
        run: dotnet build --no-restore
      - name: Test
        run: dotnet test --no-build --verbosity normal
`;
}

function dockerWorkflow() {
  return `name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4
      - name: Build Docker image
        run: docker build -t app:ci .
`;
}

const GENERATORS = {
  node: (detected) => nodeWorkflow(detected.packageManager),
  python: () => pythonWorkflow(),
  go: () => goWorkflow(),
  rust: () => rustWorkflow(),
  'java-maven': () => javaMavenWorkflow(),
  'java-gradle': () => javaGradleWorkflow(),
  ruby: () => rubyWorkflow(),
  php: () => phpWorkflow(),
  dotnet: () => dotnetWorkflow(),
  docker: () => dockerWorkflow(),
};

/**
 * Returns the generated YAML string for a detected project type, or
 * null if the type isn't one we have a template for.
 */
export function generateWorkflowYaml(detected) {
  const generator = GENERATORS[detected.type];
  return generator ? generator(detected) : null;
}
