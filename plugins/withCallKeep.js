const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

const CALLKEEP_PERMISSIONS = [
  'android.permission.READ_PHONE_STATE',
  'android.permission.CALL_PHONE',
  'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
];

const withCallKeepIOS = (config) =>
  withInfoPlist(config, (mod) => {
    const plist = mod.modResults;
    const modes = plist.UIBackgroundModes || [];
    if (!modes.includes('voip')) plist.UIBackgroundModes = [...modes, 'voip'];
    return mod;
  });

const withCallKeepAndroid = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const app = manifest.application[0];

    // Permissions
    const existing = (manifest['uses-permission'] || []).map((p) => p.$['android:name']);
    for (const perm of CALLKEEP_PERMISSIONS) {
      if (!existing.includes(perm)) {
        manifest['uses-permission'] = [
          ...(manifest['uses-permission'] || []),
          { $: { 'android:name': perm } },
        ];
      }
    }

    // VoiceConnectionService
    if (!app.service) app.service = [];
    const hasService = app.service.some(
      (s) => s.$['android:name'] === 'io.wazo.callkeep.VoiceConnectionService',
    );
    if (!hasService) {
      app.service.push({
        $: {
          'android:name': 'io.wazo.callkeep.VoiceConnectionService',
          'android:label': 'MIUSLYK',
          'android:permission': 'android.permission.BIND_TELECOM_CONNECTION_SERVICE',
          'android:exported': 'true',
        },
        'intent-filter': [
          { action: [{ $: { 'android:name': 'android.telecom.ConnectionService' } }] },
        ],
      });
    }

    return mod;
  });

module.exports = (config) => withCallKeepAndroid(withCallKeepIOS(config));
