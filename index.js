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

// ─── Background Notification Task (Android) ────────────────────────────────────
// Quando il telefono riceve una notifica push con type='incoming_call'
// e l'app è CHIUSA (killed), questo task viene eseguito in headless JS
// (nessuna UI) e avvia IncomingCallService nativo — che mostra la
// schermata di chiamata full-screen + suona su STREAM_RING in loop.
try {
  const { Platform, NativeModules } = require('react-native');
  if (Platform.OS === 'android') {
    const TaskManager = require('expo-task-manager');
    const Notifications = require('expo-notifications');

    const BACKGROUND_CALL_TASK = 'SOUNDSCAPE_BACKGROUND_INCOMING_CALL';

    TaskManager.defineTask(BACKGROUND_CALL_TASK, async ({ data, error }) => {
      if (error) {
        console.warn('[BG_CALL_TASK] error:', error);
        return;
      }
      try {
        const notification = data?.notification;
        const payload = notification?.request?.content?.data ?? {};
        if (payload?.type !== 'incoming_call') return;
        const callId = payload?.callId ?? '';
        const callerName = payload?.callerName ?? 'Chiamata in arrivo';
        if (!callId) return;
        const IncomingCall = NativeModules.IncomingCall;
        if (IncomingCall?.showIncomingCall) {
          await IncomingCall.showIncomingCall(callId, callerName);
        }
      } catch (e) {
        console.warn('[BG_CALL_TASK] handler error:', e?.message);
      }
    });

    // Registra il task — expo-notifications lo invocherà per ogni notifica
    // ricevuta in background/killed (su Android)
    Notifications.registerTaskAsync(BACKGROUND_CALL_TASK).catch((e) => {
      console.warn('[BG_CALL_TASK] registerTaskAsync failed:', e?.message);
    });
  }
} catch (e) {
  console.warn('[BG_CALL_TASK] setup skipped:', e?.message);
}


require('expo-router/entry');

