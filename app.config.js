module.exports = ({ config }) => ({
  ...config,
  name: "soundscape-mobile",
  slug: "soundscape-mobile",
  version: "1.0.0",
  orientation: "portrait",
  updates: {
    url: "https://u.expo.dev/1acc4f41-619c-423f-8db0-fcc6e7243ba2",
    checkAutomatically: "ON_LOAD",
    enabled: true,
  },
  runtimeVersion: {
    policy: "appVersion",
  },
  icon: "./assets/images/icon.png",
  scheme: "soundscapemobile",
  userInterfaceStyle: "automatic",
  newArchEnabled: true,
  ios: {
    supportsTablet: true,
    buildNumber: "1",
    bundleIdentifier: "com.cucucucucuione.soundscapemobile",
    infoPlist: {
      ITSAppUsesNonExemptEncryption: false,
      UIBackgroundModes: ["audio"],
      NSMicrophoneUsageDescription: "Soundscape usa il microfono per trasmettere voce live nella radio.",
      NSCameraUsageDescription: "Soundscape usa la fotocamera per scattare foto e video da aggiungere ai tuoi post.",
    },
    config: {
      googleMapsApiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY,
    },
  },
  android: {
    googleServicesFile: "./google-services.json",
    adaptiveIcon: {
      backgroundColor: "#E6F4FE",
      foregroundImage: "./assets/images/android-icon-foreground.png",
      backgroundImage: "./assets/images/android-icon-background.png",
      monochromeImage: "./assets/images/android-icon-monochrome.png",
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
      "expo-splash-screen",
      {
        image: "./assets/images/splash-icon.png",
        imageWidth: 200,
        resizeMode: "contain",
        backgroundColor: "#ffffff",
        dark: {
          backgroundColor: "#000000",
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
