const { withAndroidManifest } = require('@expo/config-plugins');

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

module.exports = withRNTPManifest;
