// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppKilledPlaybackBehavior, Capability, State } = require('react-native-track-player');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

let setupPromise: Promise<void> | null = null;
const LIVE_STREAM_TRACK_KEY = '@soundscape/live_stream_track';
const LIVE_STREAM_USER_PAUSED_KEY = '@soundscape/live_stream_user_paused';
const RNTP_SESSION_KEY = '@soundscape/rntp_session';

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

export async function syncActiveTrackMetadata(metadata: {
  title?: string;
  artist?: string;
  album?: string;
  artwork?: string;
}) {
  if (!TrackPlayer) return;
  try {
    const activeIndex = await TrackPlayer.getActiveTrackIndex?.();
    if (activeIndex != null) {
      await TrackPlayer.updateMetadataForTrack(activeIndex, metadata);
      return;
    }
  } catch {}

  await TrackPlayer.updateNowPlayingMetadata?.(metadata).catch?.(() => {});
}

export async function resumeLivePlayback() {
  if (!TrackPlayer) return;

  const [activeTrack, savedTrackStr, playbackState] = await Promise.all([
    TrackPlayer.getActiveTrack().catch(() => null),
    AsyncStorage.getItem(LIVE_STREAM_TRACK_KEY).catch(() => null),
    TrackPlayer.getPlaybackState().catch(() => null),
  ]);

  const savedTrack = savedTrackStr ? JSON.parse(savedTrackStr) : null;
  const liveTrack = activeTrack?.isLiveStream ? activeTrack : savedTrack?.isLiveStream ? savedTrack : null;
  const state = playbackState?.state ?? playbackState;

  if (!liveTrack) {
    await TrackPlayer.play().catch(() => {});
    return;
  }

  AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY).catch(() => {});

  if (state === State?.Playing || state === State?.Buffering || state === State?.Loading) return;
  if (state === State?.Paused || state === State?.Ready) {
    await TrackPlayer.play();
    return;
  }
  if (state === State?.Error) {
    try {
      await TrackPlayer.retry();
    } catch {
      await TrackPlayer.play().catch(() => {});
    }
    return;
  }

  await TrackPlayer.reset();
  await TrackPlayer.add(liveTrack);
  await TrackPlayer.play();
}

export async function startRadioPlayback(track: {
  id: string;
  url: string;
  title: string;
  artist: string;
  album?: string;
  artwork?: string;
  isLiveStream: true;
  type?: string;
  userAgent?: string;
}) {
  if (!TrackPlayer) return;
  await ensurePlayerReady();
  await configurePlayerForRadio();
  await TrackPlayer.reset();
  await TrackPlayer.add(track);
  await TrackPlayer.play();
  // iOS live streams a volte accettano play() ma restano in Ready/Paused silenziosi
  // al primo avvio. Facciamo un secondo kick solo durante il bootstrap iniziale.
  await new Promise((resolve) => setTimeout(resolve, 700));
  try {
    const ps = await TrackPlayer.getPlaybackState().catch(() => null);
    const state = ps?.state ?? ps;
    if (state === State?.Ready || state === State?.Paused) {
      await TrackPlayer.play().catch(() => {});
    } else if (state === State?.Error) {
      await TrackPlayer.retry?.().catch(() => {});
      await TrackPlayer.play().catch(() => {});
    }
  } catch {}
  await AsyncStorage.setItem(RNTP_SESSION_KEY, JSON.stringify({ type: 'radio', stationId: track.id })).catch(() => {});
  await AsyncStorage.setItem(LIVE_STREAM_TRACK_KEY, JSON.stringify(track)).catch(() => {});
  await AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY).catch(() => {});
  await syncActiveTrackMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
  }).catch(() => {});
}

export async function playRadioPlayback() {
  if (!TrackPlayer) return;
  await ensurePlayerReady();
  await configurePlayerForRadio();
  await AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY).catch(() => {});
  await TrackPlayer.play();
}

export async function pauseRadioPlayback() {
  if (!TrackPlayer) return;
  await AsyncStorage.setItem(LIVE_STREAM_USER_PAUSED_KEY, '1').catch(() => {});
  await TrackPlayer.pause();
}
