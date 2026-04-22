const { withAndroidManifest, withMainApplication, withSettingsGradle, withAppBuildGradle } = require('@expo/config-plugins');

const withRNTPManifest = (config) => {
  return withAndroidManifest(config, (config) => {
    const manifest = config.modResults.manifest;
    const application = manifest.application[0];

    if (!application.service) application.service = [];

    const exists = application.service.some(
      (s) => s.$?.['android:name'] === 'com.doublesymmetry.trackplayer.service.MusicService'
    );

    if (!exists) {
      application.service.push({
        $: {
          'android:name': 'com.doublesymmetry.trackplayer.service.MusicService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaPlayback',
          // CRITICO: senza stopWithTask="false" il servizio viene killato
          // quando l'app viene swipata dai recenti, perdendo audio e notifica.
          'android:stopWithTask': 'false',
        },
      });
    }

    return config;
  });
};

const withRNTPMainApplication = (config) => {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('TrackPlayerPackage')) {
      return config;
    }

    // Sostituisce "return packages" con una versione che aggiunge il pacchetto.
    // Nelle versioni precedenti era 'return packages'.
    // In Expo SDK 54 usa: PackageList(this).packages.apply { ... }
    if (contents.includes('return packages')) {
      contents = contents.replace(
        /return packages/,
        'packages.add(com.doublesymmetry.trackplayer.TrackPlayerPackage())\n          return packages'
      );
    } else if (contents.includes('// add(MyReactNativePackage())')) {
      contents = contents.replace(
        /\/\/ add\(MyReactNativePackage\(\)\)/,
        '// add(MyReactNativePackage())\n              add(com.doublesymmetry.trackplayer.TrackPlayerPackage())'
      );
    } else {
      // Fallback per altre strutture Kotlin di React Native
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        'PackageList(this).packages.apply {\n              add(com.doublesymmetry.trackplayer.TrackPlayerPackage())'
      );
    }

    config.modResults.contents = contents;
    return config;
  });
};

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

const withRNTP = (config) => {
  config = withRNTPManifest(config);
  config = withRNTPMainApplication(config);
  config = withRNTPGradle(config);
  return config;
};

module.exports = withRNTP;
