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

// ─── Background notification task — chiamate in arrivo (Android) ─────────────
// Quando arriva una notifica push con type='incoming_call' e l'app è in background
// o killed, questo task mostra la schermata nativa di chiamata tramite CallKeep.
// expo-task-manager è già incluso in Expo SDK — nessun native module aggiuntivo.
const SOUNDSCAPE_CALL_TASK = 'SOUNDSCAPE_INCOMING_CALL';
try {
  const TaskManager = require('expo-task-manager');
  TaskManager.defineTask(SOUNDSCAPE_CALL_TASK, async ({ data, error }) => {
    if (error || !data) return;
    const notifData = data?.notification?.request?.content?.data ?? {};
    if (notifData.type !== 'incoming_call') return;
    const { callId, callerName } = notifData;
    if (!callId) return;
    try {
      const { Platform } = require('react-native');
      if (Platform.OS !== 'android') return;
      const RNCallKeep = require('react-native-callkeep').default;
      await RNCallKeep.setup({
        android: {
          alertTitle: 'Autorizzazione chiamate',
          alertDescription: 'SoundScape ha bisogno di gestire le chiamate audio',
          cancelButton: 'Annulla',
          okButton: 'OK',
          additionalPermissions: [],
          selfManaged: false,
        },
      }).catch(() => {});
      RNCallKeep.displayIncomingCall(callId, callerName ?? 'Utente', callerName ?? 'Utente', 'generic', false);
    } catch (ckErr) {
      console.warn('[CALL TASK] CallKeep error:', ckErr?.message);
    }
  });
} catch (e) {
  console.warn('[CALL TASK] defineTask skipped:', e?.message);
}

require('expo-router/entry');
