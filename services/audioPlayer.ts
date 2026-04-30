// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppKilledPlaybackBehavior, Capability, State } = require('react-native-track-player');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Audio } = require('expo-av');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Platform } = require('react-native');

let setupPromise: Promise<void> | null = null;
const LIVE_STREAM_TRACK_KEY = '@soundscape/live_stream_track';
const LIVE_STREAM_USER_PAUSED_KEY = '@soundscape/live_stream_user_paused';
const RNTP_SESSION_KEY = '@soundscape/rntp_session';
const RADIO_LOG_PREFIX = '[RNTP-RADIO]';

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
  console.log(RADIO_LOG_PREFIX, 'startRadioPlayback begin', {
    id: track.id,
    url: track.url,
    type: track.type,
    platform: Platform.OS,
  });
  if (Platform.OS === 'ios') {
    // Rilascia esplicitamente la sessione expo-av prima di passare al live stream RNTP.
    // Senza questo handoff, il primo play della radio su iOS può restare muto e
    // partire solo al secondo comando (UI o widget).
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: false,
      staysActiveInBackground: false,
      shouldDuckAndroid: false,
      playThroughEarpieceAndroid: false,
    }).catch(() => {});
    console.log(RADIO_LOG_PREFIX, 'released expo-av session before radio start');
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await ensurePlayerReady();
  await configurePlayerForRadio();
  await TrackPlayer.reset();
  console.log(RADIO_LOG_PREFIX, 'player reset complete');
  await TrackPlayer.add(track);
  console.log(RADIO_LOG_PREFIX, 'track added');
  await TrackPlayer.play();
  console.log(RADIO_LOG_PREFIX, 'initial play requested');
  // iOS live streams: il primo play può restare "appeso" senza errore.
  // Aspettiamo il bootstrap reale e, se non entra in Loading/Buffering/Playing,
  // facciamo un unico retry controllato.
  const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  let didRetry = false;
  let didSecondKick = false;
  let reachedPlaying = false;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(450);
    try {
      const [ps, playWhenReady] = await Promise.all([
        TrackPlayer.getPlaybackState().catch(() => null),
        TrackPlayer.getPlayWhenReady?.().catch(() => null),
      ]);
      const state = ps?.state ?? ps;
      console.log(RADIO_LOG_PREFIX, 'startup probe', {
        attempt,
        state,
        playWhenReady,
        didRetry,
        didSecondKick,
      });
      const isPlaying = state === State?.Playing;
      const isBooting =
        state === State?.Loading ||
        state === State?.Buffering;
      if (isPlaying && playWhenReady !== false) {
        reachedPlaying = true;
        break;
      }

      if (isBooting && playWhenReady === true) {
        // Non usciamo subito: su alcuni iPhone il live stream resta "buffering"
        // indefinitamente pur non avviando mai l'audio. Aspettiamo ancora un po'
        // prima di applicare il fallback equivalente al secondo comando manuale.
        if (attempt < 2) continue;
      }

      const stuck =
        state === State?.Ready ||
        state === State?.Paused ||
        state === State?.None ||
        playWhenReady !== true ||
        isBooting;

      if (state === State?.Error) {
        console.log(RADIO_LOG_PREFIX, 'startup retry from error');
        await TrackPlayer.retry?.().catch(() => {});
        await TrackPlayer.play().catch(() => {});
        didRetry = true;
        continue;
      }

      if (stuck && !didRetry && attempt >= 1) {
        console.log(RADIO_LOG_PREFIX, 'startup hard reset retry');
        await TrackPlayer.reset();
        await TrackPlayer.add(track);
        await TrackPlayer.play().catch(() => {});
        didRetry = true;
        continue;
      }

      // Ultimo fallback: replica internamente il "secondo comando" che l'utente
      // sta facendo a mano via UI/widget. Se il primo bootstrap live resta muto,
      // un pause/play successivo lo sblocca quasi sempre su iOS.
      if (stuck && !didSecondKick && attempt >= 2) {
        console.log(RADIO_LOG_PREFIX, 'startup second kick pause/play');
        await TrackPlayer.pause().catch(() => {});
        await wait(180);
        await TrackPlayer.play().catch(() => {});
        didSecondKick = true;
        continue;
      }
    } catch {}
  }
  if (!reachedPlaying) {
    console.log(RADIO_LOG_PREFIX, 'startup ended without explicit playing state');
  }
  await AsyncStorage.setItem(RNTP_SESSION_KEY, JSON.stringify({ type: 'radio', stationId: track.id })).catch(() => {});
  await AsyncStorage.setItem(LIVE_STREAM_TRACK_KEY, JSON.stringify(track)).catch(() => {});
  await AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY).catch(() => {});
  await syncActiveTrackMetadata({
    title: track.title,
    artist: track.artist,
    album: track.album,
    artwork: track.artwork,
  }).catch(() => {});
  const finalState = await TrackPlayer.getPlaybackState().catch(() => null);
  const finalPlayWhenReady = await TrackPlayer.getPlayWhenReady?.().catch(() => null);
  console.log(RADIO_LOG_PREFIX, 'startRadioPlayback end', {
    state: finalState?.state ?? finalState,
    playWhenReady: finalPlayWhenReady,
  });
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
