// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Event, AppKilledPlaybackBehavior, Capability } = require('react-native-track-player');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Platform } = require('react-native');

// Questo file viene eseguito in un thread separato in background da React Native Track Player.
// È obbligatorio registrarlo tramite TrackPlayer.registerPlaybackService().
export async function PlaybackService() {
  try {
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.ContinuePlayback ?? 'continue-playback',
      },
      // iOS 16+: Next/Previous sempre visibili nel widget — li abilitiamo per renderli
      // funzionali (restart stream). Su Android causano crash nel MediaSession nativo
      // se non presenti anche in notificationCapabilities, quindi li escludiamo.
      capabilities: Platform.OS === 'ios'
        ? [Capability.Play, Capability.Pause, Capability.Stop, Capability.Next, Capability.Previous]
        : [Capability.Play, Capability.Pause, Capability.Stop],
      // Android: no Stop nella notifica — alcuni ROM (Xiaomi/OPPO/Samsung) inviano
      // RemoteStop automaticamente quando si va in background/si blocca lo schermo;
      // con reset() la notifica sparisce. Senza Stop button non si rischia.
      // iOS: Stop necessario per chiudere il widget lock screen.
      notificationCapabilities: Platform.OS === 'ios'
        ? [Capability.Play, Capability.Pause, Capability.Stop]
        : [Capability.Play, Capability.Pause],
      compactCapabilities: [Capability.Play, Capability.Pause],
    });
  } catch (e) {
    console.warn('[RNTP PlaybackService] updateOptions error:', e);
  }

  // ── Logica di restart live stream ────────────────────────────────────────────
  // Per i live stream HLS (radio), dopo una pausa la finestra HLS si sposta avanti.
  // Un semplice play() fallisce silenziosamente su iOS → serve un vero restart.
  async function restartIfLive() {
    const track = await TrackPlayer.getActiveTrack();
    if (track?.isLiveStream) {
      await TrackPlayer.reset();
      await TrackPlayer.add(track);
      await TrackPlayer.play();
    } else {
      await TrackPlayer.play();
    }
  }

  // ── Remote control events ───────────────────────────────────────────
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try { await restartIfLive(); } catch { await TrackPlayer.play().catch(() => {}); }
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  // iOS: reset() per chiudere correttamente la sessione HLS (stop() lascia lo stream attivo).
  // Android: stop() invece di reset() — reset() distrugge il ForegroundService e la notifica
  // sparisce; alcuni ROM inviano RemoteStop automaticamente quando si va in background.
  // Con stop() la notifica rimane (mostra Play) e l'utente può riprendere dalla notifica.
  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    if (Platform.OS === 'ios') {
      TrackPlayer.reset().catch(() => {});
    } else {
      TrackPlayer.stop().catch(() => {});
    }
  });

  // ◀◀ ▶▶: su iOS 16+ compaiono sempre — li colleghiamo al restart dello stream live.
  // Per i podcast (isLiveStream=false) non fanno nulla (nessuna traccia precedente/successiva).
  TrackPlayer.addEventListener(Event.RemoteNext, async () => {
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track?.isLiveStream) { await restartIfLive(); }
    } catch {}
  });
  TrackPlayer.addEventListener(Event.RemotePrevious, async () => {
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track?.isLiveStream) { await restartIfLive(); }
    } catch {}
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
}
