const { withAndroidManifest, withMainApplication, withSettingsGradle, withAppBuildGradle } = require('@expo/config-plugins');

const withRNTPManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];

    if (!application.service) application.service = [];

    if (!manifest.$) manifest.$ = {};
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';

    const exists = application.service.some(
      (s) => s.$?.['android:name'] === 'com.doublesymmetry.trackplayer.service.MusicService'
    );

    if (!exists) {
      application.service.push({
        $: {
          'android:name': 'com.doublesymmetry.trackplayer.service.MusicService',
          'android:enabled': 'true',
          'android:exported': 'true',
          'android:foregroundServiceType': 'mediaPlayback',
          'android:stopWithTask': 'false',
          'tools:replace': 'android:exported,android:enabled',
        },
      });
    } else {
      const service = application.service.find(
        (s) => s.$?.['android:name'] === 'com.doublesymmetry.trackplayer.service.MusicService'
      );
      service.$['android:stopWithTask'] = 'false';
      service.$['android:exported'] = 'true';
      service.$['android:enabled'] = 'true';
      service.$['tools:replace'] = 'android:exported,android:enabled,android:stopWithTask';
    }

    return config;
  });
};

// Expo's autolinking non gestisce RNTP — serve linkaggio manuale
const withRNTPGradle = (config) => {
  config = withSettingsGradle(config, (config) => {
    const contents = config.modResults.contents;
    if (!contents.includes("':react-native-track-player'")) {
      config.modResults.contents = contents + `
include ':react-native-track-player'
project(':react-native-track-player').projectDir = new File(rootProject.projectDir, '../node_modules/react-native-track-player/android')
`;
    }
    return config;
  });

  config = withAppBuildGradle(config, (config) => {
    let contents = config.modResults.contents;
    if (!contents.includes("project(':react-native-track-player')")) {
      contents = contents.replace(
        /dependencies\s*\{/,
        "dependencies {\n    implementation project(':react-native-track-player')"
      );
      config.modResults.contents = contents;
    }
    return config;
  });

  return config;
};

// PackageList non include RNTP (non gestito da Expo autolinking) — registrazione manuale
const withRNTPMainApplication = (config) => {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('com.doublesymmetry.trackplayer.TrackPlayer()')) {
      return config;
    }

    contents = contents.replace(
      /\/\/ add\(MyReactNativePackage\(\)\)/,
      '// add(MyReactNativePackage())\n              add(com.doublesymmetry.trackplayer.TrackPlayer())'
    );

    if (!contents.includes('com.doublesymmetry.trackplayer.TrackPlayer()')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        'PackageList(this).packages.apply {\n              add(com.doublesymmetry.trackplayer.TrackPlayer())'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

const withRNTP = (config) => {
  config = withRNTPManifest(config);
  config = withRNTPGradle(config);
  config = withRNTPMainApplication(config);
  return config;
};

module.exports = withRNTP;
