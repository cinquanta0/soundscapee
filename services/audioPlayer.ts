// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppKilledPlaybackBehavior, Capability } = require('react-native-track-player');

let setupPromise: Promise<void> | null = null;

async function doSetup() {
  await TrackPlayer.setupPlayer({
    autoHandleInterruptions: true,
    autoUpdateMetadata: true,
    minBuffer: 15,
    maxBuffer: 50,
    playBuffer: 2,
    backBuffer: 0,
    iosCategory: 'playback',
    iosCategoryMode: 'default',
    iosCategoryOptions: ['allowBluetooth', 'allowAirPlay', 'allowBluetoothA2DP'],
  });
}

export async function ensurePlayerReady() {
  if (!TrackPlayer) return;
  if (!setupPromise) {
    setupPromise = doSetup().catch((error: any) => {
      const message = String(error?.message ?? error ?? '');
      if (
        message.includes('already been initialized') ||
        message.includes('player has already been initialized') ||
        message.includes('The player has already been initialized')
      ) {
        return;
      }
      setupPromise = null;
      throw error;
    });
  }
  await setupPromise;
}

export async function configurePlayerForRadio() {
  if (!TrackPlayer) return;
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior:
        AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification ?? 'stop-playback-and-remove-notification',
    },
    capabilities: [Capability.Play, Capability.Pause],
    notificationCapabilities: [Capability.Play, Capability.Pause],
    compactCapabilities: [Capability.Play, Capability.Pause],
  });
}

export async function configurePlayerForPodcast() {
  if (!TrackPlayer) return;
  await TrackPlayer.updateOptions({
    android: {
      appKilledPlaybackBehavior:
        AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification ?? 'stop-playback-and-remove-notification',
    },
    capabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.JumpForward,
      Capability.JumpBackward,
    ],
    notificationCapabilities: [
      Capability.Play,
      Capability.Pause,
      Capability.SeekTo,
      Capability.JumpForward,
      Capability.JumpBackward,
    ],
    compactCapabilities: [Capability.Play, Capability.Pause],
    forwardJumpInterval: 15,
    backwardJumpInterval: 15,
  });
}
