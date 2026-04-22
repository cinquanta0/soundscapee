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

    if (contents.includes('TrackPlayerPackage')) {
      return config;
    }

    // Sostituisce "return packages" con una versione che aggiunge il pacchetto.
    // Usa .also{} di Kotlin — compatibile con qualsiasi indentazione.
    contents = contents.replace(
      /return packages/,
      'packages.add(com.doublesymmetry.trackplayer.TrackPlayerPackage())\n          return packages'
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
