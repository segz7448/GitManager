const { withDangerousMod, withMainApplication, withAndroidManifest } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const PACKAGE_PATH = 'com/zenas/gitmanager/widget';
const NATIVE_SOURCE_DIR = path.join(__dirname, 'widget-native');
const RESOURCES_DIR = path.join(__dirname, 'widget-resources');

function withWidgetNativeFiles(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.platformProjectRoot;

      // Kotlin source files
      const destJavaDir = path.join(projectRoot, 'app/src/main/java', PACKAGE_PATH);
      fs.mkdirSync(destJavaDir, { recursive: true });
      for (const file of fs.readdirSync(NATIVE_SOURCE_DIR)) {
        fs.copyFileSync(path.join(NATIVE_SOURCE_DIR, file), path.join(destJavaDir, file));
      }

      // res/layout and res/xml resources
      const destLayoutDir = path.join(projectRoot, 'app/src/main/res/layout');
      const destXmlDir = path.join(projectRoot, 'app/src/main/res/xml');
      fs.mkdirSync(destLayoutDir, { recursive: true });
      fs.mkdirSync(destXmlDir, { recursive: true });

      for (const file of fs.readdirSync(path.join(RESOURCES_DIR, 'layout'))) {
        fs.copyFileSync(
          path.join(RESOURCES_DIR, 'layout', file),
          path.join(destLayoutDir, file)
        );
      }
      for (const file of fs.readdirSync(path.join(RESOURCES_DIR, 'xml'))) {
        fs.copyFileSync(
          path.join(RESOURCES_DIR, 'xml', file),
          path.join(destXmlDir, file)
        );
      }

      return config;
    },
  ]);
}

function withWidgetPackageRegistration(config) {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;
    const importLine = 'import com.zenas.gitmanager.widget.WidgetControlPackage';

    if (!contents.includes(importLine)) {
      contents = contents.replace(/^(package [^\n]+\n)/, `$1\n${importLine}\n`);
    }
    if (!contents.includes('WidgetControlPackage()')) {
      contents = contents.replace(
        /(packages\.apply\s*\{)/,
        `$1\n          add(WidgetControlPackage())`
      );
    }

    config.modResults.contents = contents;
    return config;
  });
}

function withWidgetManifest(config) {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;

    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const permissionsToAdd = [
      'android.permission.FOREGROUND_SERVICE',
      'android.permission.FOREGROUND_SERVICE_DATA_SYNC',
    ];
    for (const perm of permissionsToAdd) {
      const exists = manifest['uses-permission'].some((p) => p.$?.['android:name'] === perm);
      if (!exists) {
        manifest['uses-permission'].push({ $: { 'android:name': perm } });
      }
    }

    const application = manifest.application[0];

    if (!application.receiver) application.receiver = [];
    const receiverExists = application.receiver.some(
      (r) => r.$?.['android:name'] === '.widget.RepoActionsWidgetProvider'
    );
    if (!receiverExists) {
      application.receiver.push({
        $: {
          'android:name': '.widget.RepoActionsWidgetProvider',
          'android:exported': 'false',
        },
        'intent-filter': [
          {
            action: [{ $: { 'android:name': 'android.appwidget.action.APPWIDGET_UPDATE' } }],
          },
        ],
        'meta-data': [
          {
            $: {
              'android:name': 'android.appwidget.provider',
              'android:resource': '@xml/repo_actions_widget_info',
            },
          },
        ],
      });
    }

    if (!application.service) application.service = [];
    const serviceExists = application.service.some(
      (s) => s.$?.['android:name'] === '.widget.RepoActionsMonitorService'
    );
    if (!serviceExists) {
      application.service.push({
        $: {
          'android:name': '.widget.RepoActionsMonitorService',
          'android:foregroundServiceType': 'dataSync',
          'android:exported': 'false',
        },
      });
    }

    return config;
  });
}

function withRepoActionsWidget(config) {
  config = withWidgetNativeFiles(config);
  config = withWidgetPackageRegistration(config);
  config = withWidgetManifest(config);
  return config;
}

module.exports = withRepoActionsWidget;
