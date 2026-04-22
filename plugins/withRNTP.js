const { withAndroidManifest, withMainApplication } = require('@expo/config-plugins');

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
        },
      });
    }

    return config;
  });
};

const withRNTPMainApplication = (config) => {
  return withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (contents.includes('com.doublesymmetry.trackplayer.TrackPlayerPackage')) {
      return config;
    }

    // Aggiunge il package manualmente nella lista, usando nome fully-qualified
    // per evitare import (più robusto contro variazioni del template)
    contents = contents.replace(
      /val packages = PackageList\(this\)\.packages/,
      [
        'val packages = PackageList(this).packages',
        '          if (packages.none { it is com.doublesymmetry.trackplayer.TrackPlayerPackage }) {',
        '            packages.add(com.doublesymmetry.trackplayer.TrackPlayerPackage())',
        '          }',
      ].join('\n')
    );

    config.modResults.contents = contents;
    return config;
  });
};

const withRNTP = (config) => {
  config = withRNTPManifest(config);
  config = withRNTPMainApplication(config);
  return config;
};

module.exports = withRNTP;
