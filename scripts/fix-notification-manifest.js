// Run this after every `expo prebuild` (locally or in CI) - it patches a
// manifest merge conflict that Expo's config-plugin mod ordering can't
// reliably resolve on its own.
//
// The conflict: @react-native-firebase/messaging's own AndroidManifest.xml
// declares com.google.firebase.messaging.default_notification_color (and,
// on some versions, ...default_notification_icon) pointing at @color/white.
// expo-notifications' plugin declares the same keys pointing at our custom
// notification color/icon. Two different values for the same manifest
// attribute is a hard Gradle error - it won't guess which one should win -
// so the build fails at :app:processDebugMainManifest / processReleaseMainManifest
// before an APK is ever produced.
//
// Fix: add tools:replace="android:resource" to our app-level declarations
// so they explicitly win, exactly as Gradle's own error message suggests
// (https://developer.android.com/studio/build/manifest-merge). We do this
// as a plain string patch on the generated file rather than an
// expo-config-plugin `withAndroidManifest` mod, because that mod's
// execution order relative to expo-notifications' own mod isn't
// guaranteed - it ran too early in testing and had nothing to patch yet.

const fs = require('fs');
const path = require('path');

const MANIFEST_PATH = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');

const TARGET_NAMES = [
  'com.google.firebase.messaging.default_notification_color',
  'com.google.firebase.messaging.default_notification_icon',
];

function main() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error(`[fix-notification-manifest] ${MANIFEST_PATH} does not exist - did prebuild run?`);
    process.exit(1);
  }

  let xml = fs.readFileSync(MANIFEST_PATH, 'utf8');
  let patchedCount = 0;

  for (const name of TARGET_NAMES) {
    // Match the whole self-closing <meta-data .../> tag for this android:name,
    // regardless of attribute order, and only if it doesn't already have
    // tools:replace.
    const tagRegex = new RegExp(
      `<meta-data[^>]*android:name="${name.replace(/\./g, '\\.')}"[^>]*/>`,
      'g'
    );
    xml = xml.replace(tagRegex, (tag) => {
      if (tag.includes('tools:replace')) return tag;
      patchedCount++;
      return tag.replace('/>', ' tools:replace="android:resource"/>');
    });
  }

  if (patchedCount === 0) {
    console.log(
      '[fix-notification-manifest] No matching meta-data tags found to patch ' +
        '(nothing to do, or the tags already have tools:replace).'
    );
    return;
  }

  fs.writeFileSync(MANIFEST_PATH, xml, 'utf8');
  console.log(`[fix-notification-manifest] Patched ${patchedCount} meta-data tag(s) with tools:replace.`);
}

main();
