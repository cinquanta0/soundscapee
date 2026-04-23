// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Event, AppKilledPlaybackBehavior, Capability } = require('react-native-track-player');

// Questo file viene eseguito in un thread separato in background da React Native Track Player.
// È obbligatorio registrarlo tramite TrackPlayer.registerPlaybackService().
export async function PlaybackService() {
  // ── Android: configura comportamento quando l'app viene killata dai recenti ────
  // ContinuePlayback = la notifica rimane e il servizio continua a riprodurre
  // senza questo, il ForegroundService viene distrutto quando si swipa via l'app.
  try {
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.ContinuePlayback ?? 'continue-playback',
      },
      capabilities: [
        Capability.Play,
        Capability.Pause,
        Capability.Stop,
        Capability.SeekTo,
        Capability.JumpForward,
        Capability.JumpBackward,
      ],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      forwardJumpInterval: 15,
      backwardJumpInterval: 15,
    });
  } catch (e) {
    console.warn('[RNTP PlaybackService] updateOptions error:', e);
  }

  // ── Remote control events ───────────────────────────────────────────
  // Per i live stream HLS (radio), dopo una pausa la finestra HLS si sposta avanti.
  // Un semplice play() fallisce silenziosamente su iOS → serve un vero restart.
  TrackPlayer.addEventListener(Event.RemotePlay, async () => {
    try {
      const track = await TrackPlayer.getActiveTrack();
      if (track?.isLiveStream) {
        // Restart live stream: reset + re-add stessa traccia + play
        await TrackPlayer.reset();
        await TrackPlayer.add(track);
        await TrackPlayer.play();
      } else {
        await TrackPlayer.play();
      }
    } catch {
      await TrackPlayer.play().catch(() => {});
    }
  });
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop,          () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteJumpForward,   ({ interval }: { interval: number }) =>
    TrackPlayer.seekBy(interval),
  );
  TrackPlayer.addEventListener(Event.RemoteJumpBackward,  ({ interval }: { interval: number }) =>
    TrackPlayer.seekBy(-interval),
  );
  TrackPlayer.addEventListener(Event.RemoteSeek,          ({ position }: { position: number }) =>
    TrackPlayer.seekTo(position),
  );
  // Gestione next/prev per compatibilità con tasti hardware Android (cuffie BT)
  TrackPlayer.addEventListener(Event.RemoteNext,          () => TrackPlayer.skipToNext().catch(() => {}));
  TrackPlayer.addEventListener(Event.RemotePrevious,      () => TrackPlayer.skipToPrevious().catch(() => {}));
}
