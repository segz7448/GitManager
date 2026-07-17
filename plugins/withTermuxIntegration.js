const { withDangerousMod, withMainApplication, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/zenas/gitmanager/termux';
const SOURCE_DIR = path.join(__dirname, 'termux-native');

/**
 * Copies the hand-written Termux integration Kotlin files into the
 * generated android/ project on every prebuild (prebuild wipes android/,
 * so this can't just be committed directly into android/ once).
 */
function withTermuxNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const destDir = path.join(
        config.modRequest.platformProjectRoot,
        'app/src/main/java',
        PACKAGE_PATH
      );
      fs.mkdirSync(destDir, { recursive: true });

      for (const file of ['TermuxRunCommandModule.kt', 'TermuxPackage.kt']) {
        const src = path.join(SOURCE_DIR, file);
        const dest = path.join(destDir, file);
        fs.copyFileSync(src, dest);
      }

      return config;
    },
  ]);
}

/**
 * Registers TermuxPackage() inside the packages.apply { } block that the
 * Expo bare template's MainApplication.kt already contains.
 */
function withTermuxPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    const importLine = 'import com.zenas.gitmanager.termux.TermuxPackage';

    if (!contents.includes(importLine)) {
      // insert import after the package declaration line
      contents = contents.replace(
        /^(package [^\n]+\n)/,
        `$1\n${importLine}\n`
      );
    }

    if (!contents.includes('TermuxPackage()')) {
      contents = contents.replace(
        /(packages\.apply\s*\{)/,
        `$1\n          add(TermuxPackage())`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

/**
 * Adds the RUN_COMMAND permission (so Android's permission system knows
 * about it - the user still grants it manually in Settings, or the app
 * requests it at runtime) and a <queries> element so this app can see
 * Termux on Android 11+ (API 30+ package visibility rules).
 */
function withTermuxManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const hasPermission = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === 'com.termux.permission.RUN_COMMAND'
    );
    if (!hasPermission) {
      manifest['uses-permission'].push({
        $: { 'android:name': 'com.termux.permission.RUN_COMMAND' },
      });
    }

    if (!manifest.queries) manifest.queries = [{}];
    const queriesBlock = manifest.queries[0];
    if (!queriesBlock.package) queriesBlock.package = [];
    const hasQuery = queriesBlock.package.some((p) => p.$?.['android:name'] === 'com.termux');
    if (!hasQuery) {
      queriesBlock.package.push({ $: { 'android:name': 'com.termux' } });
    }

    return config;
  });
}

function withTermuxIntegration(config) {
  config = withTermuxNativeFiles(config);
  config = withTermuxPackageRegistration(config);
  config = withTermuxManifest(config);
  return config;
}

module.exports = withTermuxIntegration;
