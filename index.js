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

// ─── FCM background handler — chiamate in arrivo (Android) ───────────────────
// Intercetta messaggi FCM data-only quando l'app è in background o killed.
// La Cloud Function onCallCreated invia un data-only message con type='incoming_call'.
// Questo handler mostra la schermata nativa di chiamata tramite CallKeep ConnectionService.
const { Platform } = require('react-native');
if (Platform.OS === 'android') {
  try {
    const messaging = require('@react-native-firebase/messaging').default;
    messaging().setBackgroundMessageHandler(async (remoteMessage) => {
      if (remoteMessage?.data?.type !== 'incoming_call') return;
      const { callId, callerName } = remoteMessage.data;
      try {
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
        RNCallKeep.displayIncomingCall(callId, callerName, callerName, 'generic', false);
      } catch (ckErr) {
        console.warn('[FCM call] CallKeep error:', ckErr?.message);
      }
    });
  } catch (e) {
    console.warn('[FCM] background handler skipped:', e?.message);
  }
}

require('expo-router/entry');
