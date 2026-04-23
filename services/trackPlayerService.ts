// eslint-disable-next-line @typescript-eslint/no-require-imports
const TrackPlayer = require('react-native-track-player').default;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { Event, AppKilledPlaybackBehavior, Capability } = require('react-native-track-player');

// Questo file viene eseguito in un thread separato in background da React Native Track Player.
// È obbligatorio registrarlo tramite TrackPlayer.registerPlaybackService().
export async function PlaybackService() {
  try {
    await TrackPlayer.updateOptions({
      android: {
        appKilledPlaybackBehavior: AppKilledPlaybackBehavior?.ContinuePlayback ?? 'continue-playback',
      },
      // iOS 16+: Apple mostra sempre ◀◀ ▶▶ nel widget lock screen indipendentemente
      // dalle capabilities. Se Next/Previous sono disabilitati i tasti appaiono ma non
      // rispondono, e in certi casi bloccano anche Play/Pause/Stop nello stesso
      // MPRemoteCommandCenter. Soluzione: abilitarli e gestirli come "restart stream"
      // per i live (radio); per i podcast (isLiveStream=false) li ignoriamo.
      capabilities: [
        Capability.Play, Capability.Pause, Capability.Stop,
        Capability.Next, Capability.Previous,
      ],
      // notificationCapabilities controlla solo la notifica Android — qui teniamo
      // solo Play/Pause/Stop per non mostrare ◀◀ ▶▶ nella barra Android.
      notificationCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
      compactCapabilities: [Capability.Play, Capability.Pause, Capability.Stop],
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
  TrackPlayer.addEventListener(Event.RemoteStop,  () => TrackPlayer.stop());

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
