package com.cucucucucuione.soundscapemobile

import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.RemoteMessage

/**
 * Intercetta i messaggi FCM *prima* di expo-notifications.
 *
 * Per i messaggi di tipo "incoming_call" avvia IncomingCallService direttamente
 * (suono + full-screen intent sul lock screen) senza passare per il bridge JS.
 * Questo funziona anche quando l'app è completamente killed.
 *
 * Per tutti gli altri tipi delega a expo (super.onMessageReceived).
 */
class SoundscapeFirebaseMessagingService :
    expo.modules.notifications.service.ExpoPushNotificationService() {

    companion object {
        private const val TAG = "SCFirebaseMessaging"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        val type = data["type"]

        Log.d(TAG, "onMessageReceived: type=$type")

        if (type == "incoming_call") {
            val callId     = data["callId"]     ?: ""
            val callerName = data["callerName"] ?: "Chiamata in arrivo"

            Log.d(TAG, "Avvio IncomingCallService: callId=$callId caller=$callerName")

            val intent = Intent(this, IncomingCallService::class.java).apply {
                action = IncomingCallService.ACTION_START
                putExtra(IncomingCallService.EXTRA_CALL_ID,     callId)
                putExtra(IncomingCallService.EXTRA_CALLER_NAME, callerName)
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(this, intent)
            } else {
                startService(intent)
            }
            // Non chiamare super: expo-notifications non deve vedere questo messaggio
        } else {
            // Tutti gli altri push (like, follow, ecc.) → gestiti normalmente da expo
            super.onMessageReceived(remoteMessage)
        }
    }
}
