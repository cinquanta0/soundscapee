// ─── React Native Track Player — registrazione servizio background ─────────────
// DEVE essere la prima cosa eseguita, prima di expo-router.
// Su Android, il MusicService viene avviato come ForegroundService e
// registerPlaybackService collega il thread JS al servizio nativo.
try {
  const TrackPlayer = require('react-native-track-player').default;
  if (TrackPlayer) {
    const { PlaybackService } = require('./services/trackPlayerService');
    TrackPlayer.registerPlaybackService(() => PlaybackService);
  }
} catch (e) {
  // RNTP non disponibile (simulatore web o build senza native)
  console.warn('[RNTP] registerPlaybackService skipped:', e?.message);
}

require('expo-router/entry');
