import TrackPlayer, { Event } from 'react-native-track-player';

// Questo file viene eseguito in un thread separato in background da React Native Track Player.
// È obbligatorio registrarlo tramite TrackPlayer.registerPlaybackService().
export async function PlaybackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => TrackPlayer.play());
  TrackPlayer.addEventListener(Event.RemotePause, () => TrackPlayer.pause());
  TrackPlayer.addEventListener(Event.RemoteStop, () => TrackPlayer.stop());
  TrackPlayer.addEventListener(Event.RemoteJumpForward, ({ interval }) =>
    TrackPlayer.seekBy(interval),
  );
  TrackPlayer.addEventListener(Event.RemoteJumpBackward, ({ interval }) =>
    TrackPlayer.seekBy(-interval),
  );
  TrackPlayer.addEventListener(Event.RemoteSeek, ({ position }) =>
    TrackPlayer.seekTo(position),
  );
}
