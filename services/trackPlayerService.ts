// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Event, AppKilledPlaybackBehavior, Capability, State } = require('react-native-track-player');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Platform } = require('react-native');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const AsyncStorage = require('@react-native-async-storage/async-storage').default;

const RNTP_SESSION_KEY = '@soundscape/rntp_session';
const LIVE_STREAM_TRACK_KEY = '@soundscape/live_stream_track';
const LIVE_STREAM_USER_PAUSED_KEY = '@soundscape/live_stream_user_paused';

// Questo file viene eseguito in un thread separato in background da React Native Track Player.
// È obbligatorio registrarlo tramite TrackPlayer.registerPlaybackService().
export async function PlaybackService() {
  try {
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.StopPlaybackAndRemoveNotification ?? 'stop-playback-and-remove-notification',
      },
      // Base capabilities conservative: le screen specifiche possono estenderle
      // (es. podcast con seek/jump). Per la radio live su iOS i controlli più
      // affidabili sono play/pause, come già avviene nel player podcast.
      capabilities: [Capability.Play, Capability.Pause],
      notificationCapabilities: [Capability.Play, Capability.Pause],
      compactCapabilities: [Capability.Play, Capability.Pause],
    });
  } catch (e) {
    console.warn('[RNTP PlaybackService] updateOptions error:', e);
  }

  async function markLiveStreamUserPaused(paused: boolean) {
    try {
      const activeTrack = await TrackPlayer.getActiveTrack().catch(() => null);
      const savedTrackStr = !activeTrack
        ? await AsyncStorage.getItem(LIVE_STREAM_TRACK_KEY).catch(() => null)
        : null;
      const savedTrack = savedTrackStr ? JSON.parse(savedTrackStr) : null;
      const liveTrack = activeTrack?.isLiveStream ? activeTrack : savedTrack?.isLiveStream ? savedTrack : null;
      if (!liveTrack) return;
      if (paused) await AsyncStorage.setItem(LIVE_STREAM_USER_PAUSED_KEY, '1');
      else await AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY);
    } catch {}
  }

  // ── Remote control events ───────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    await AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY).catch(() => {});
    try { await TrackPlayer.play(); } catch { await TrackPlayer.retry?.().catch(() => {}); }
  });
  TrackPlayer.addEventListener(Event.RemotePause, async () => {
    await markLiveStreamUserPaused(true);
    return TrackPlayer.pause();
  });
  // RemoteStop → solo pause(), mai reset().
  // reset() distrugge il ForegroundService Android e rimuove il widget iOS.
  // Alcuni ROM (Xiaomi/Samsung/OPPO) e iOS inviano RemoteStop automaticamente
  // quando l'app va in background o lo schermo si blocca — reset() causerebbe
  // la scomparsa della notifica/widget senza che l'utente abbia fatto nulla.
  // Il vero reset avviene quando l'utente chiude il player dalla UI (onClose → reset()).
  TrackPlayer.addEventListener(Event.RemoteStop, async () => {
    await markLiveStreamUserPaused(true);
    TrackPlayer.pause().catch(() => {});
  });

  TrackPlayer.addEventListener(Event.RemoteJumpForward,  ({ interval }: { interval: number }) =>
    TrackPlayer.seekBy(interval),
  );
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, ({ interval }: { interval: number }) =>
    TrackPlayer.seekBy(-interval),
  );
  TrackPlayer.addEventListener(Event.RemoteSeek,         ({ position }: { position: number }) =>
    TrackPlayer.seekTo(position),
  );

  // Quando RNTP si ferma completamente (kill da task manager con StopPlaybackAndRemoveNotification,
  // o reset() manuale), svuota la sessione AsyncStorage. Così al prossimo avvio
  // dell'app il mini player non riappare e cleanStaleRNTP non trova una sessione stale.
  TrackPlayer.addEventListener(Event.PlaybackState, (data: any) => {
    const state = data?.state ?? data;
    if (state === State?.Stopped || state === State?.None) {
      AsyncStorage.multiRemove([RNTP_SESSION_KEY, LIVE_STREAM_USER_PAUSED_KEY]).catch(() => {});
    } else if (state === State?.Playing) {
      AsyncStorage.removeItem(LIVE_STREAM_USER_PAUSED_KEY).catch(() => {});
    }
  });
}
