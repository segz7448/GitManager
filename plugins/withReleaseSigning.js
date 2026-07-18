const { withAppBuildGradle } = require('@expo/config-plugins');

/**
 * Injects a release signingConfig into android/app/build.gradle that reads
 * keystore details from environment variables (set as GitHub Actions
 * secrets at build time). Runs on every `expo prebuild`, since prebuild
 * regenerates android/ from scratch and any manual edit would otherwise
 * be wiped.
 */
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;

    const signingConfigBlock = `
    release {
        if (System.getenv("RELEASE_STORE_FILE") && file(System.getenv("RELEASE_STORE_FILE")).exists()) {
            storeFile file(System.getenv("RELEASE_STORE_FILE"))
            storePassword System.getenv("RELEASE_STORE_PASSWORD")
            keyAlias System.getenv("RELEASE_KEY_ALIAS")
            keyPassword System.getenv("RELEASE_KEY_PASSWORD")
        } else {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`;

    if (contents.includes('signingConfigs {')) {
      contents = contents.replace(
        /signingConfigs\s*\{/,
        `signingConfigs {${signingConfigBlock}`
      );
    }

    if (contents.match(/release\s*\{[^}]*signingConfig\s+signingConfigs\.debug/)) {
      contents = contents.replace(
        /(release\s*\{[^}]*signingConfig\s+signingConfigs\.)debug/,
        '$1release'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

module.exports = withReleaseSigning;
