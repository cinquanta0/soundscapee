module.exports = ({ config }) => ({
  ...config,
  name: "MIUSLYK",
  slug: "soundscape-mobile",
  version: "1.0.1",
  orientation: "portrait",
  updates: {
    url: "https://u.expo.dev/1acc4f41-619c-423f-8db0-fcc6e7243ba2",
    checkAutomatically: "ON_LOAD",
    enabled: process.env.DISABLE_EXPO_UPDATES_NATIVE === "1" ? false : true,
    fallbackToCacheTimeout: 10000,
  },
  // In bare workflow, runtimeVersion must be a plain string (not a policy object)
  runtimeVersion: "1.0.1",
  icon: "./assets/images/icon.png",
  scheme: "soundscapemobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: false,
  ios: {
    supportsTablet: true,
    buildNumber: "1",
    bundleIdentifier: "com.cucucucucuione.soundscapemobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["audio", "remote-notification"],
      NSMicrophoneUsageDescription: "MIUSLYK usa il microfono per trasmettere voce live nella radio.",
      NSCameraUsageDescription: "MIUSLYK usa la fotocamera per scattare foto e video da aggiungere ai tuoi post.",
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: true,
      },
    },
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      backgroundColor: "#0D0000",
      foregroundImage: "./assets/images/android-icon-foreground.png",
    },
    edgeToEdgeEnabled: true,
    predictiveBackGestureEnabled: false,
    usesCleartextTraffic: true,
    package: "com.cucucucucuione.soundscapemobile",
    versionCode: 1,
    permissions: [
      "android.permission.RECORD_AUDIO",
      "android.permission.MODIFY_AUDIO_SETTINGS",
      "android.permission.FOREGROUND_SERVICE",
      "android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK",
      "android.permission.FOREGROUND_SERVICE_PHONE_CALL",
      "android.permission.POST_NOTIFICATIONS",
      "android.permission.WAKE_LOCK",
    ],
    config: {
      googleMaps: {
        apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
      },
    },
  },
  web: {
    output: "static",
    favicon: "./assets/images/favicon.png",
  },
  plugins: [
    "expo-router",
    [
      "expo-notifications",
      {
        defaultChannel: "default",
        sounds: ["./assets/sounds/soundscape_call.wav"],
      },
    ],
    "./plugins/withRNTP",
    "./plugins/withCallKeep",
    "./plugins/withOutgoingRingback",
    "./plugins/withIncomingCall",
    [
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 280,
        resizeMode: "contain",
        backgroundColor: "#0D0000",
        dark: {
          backgroundColor: "#0D0000",
        },
      },
    ],
  ],
  experiments: {
    typedRoutes: true,
    reactCompiler: true,
  },
  extra: {
    router: {},
    eas: {
      projectId: "1acc4f41-619c-423f-8db0-fcc6e7243ba2",
    },
  },
});
