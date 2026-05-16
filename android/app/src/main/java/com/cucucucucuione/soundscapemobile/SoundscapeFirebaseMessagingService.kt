package com.cucucucucuione.soundscapemobile

import android.app.ActivityManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.content.ContextCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

/**
 * Intercetta tutti i messaggi FCM.
 * - incoming_call  → avvia IncomingCallService (funziona anche con app killed)
 * - altri tipi     → mostra notifica di sistema standard (title/body dal payload)
 *
 * NOTA: questo service sostituisce expo's ExpoPushNotificationService nel manifest
 * (tools:node="remove" su quello e registriamo solo il nostro).
 */
class SoundscapeFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "SCFirebaseMsg"
        private const val CHANNEL_DEFAULT = "default"
    }

    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val data = remoteMessage.data
        val type = data["type"]
        Log.d(TAG, "onMessageReceived type=$type")

        if (type == "incoming_call") {
            val callId     = data["callId"]     ?: ""
            val callerName = data["callerName"] ?: "Chiamata in arrivo"
            val callType   = data["callType"]   ?: "audio"
            val notifBody  = data["notifBody"]  ?: callerName
            Log.d(TAG, "→ IncomingCallService callId=$callId caller=$callerName type=$callType fg=${isAppInForeground()}")

            // Always start IncomingCallService regardless of foreground state.
            // isAppInForeground() can return false-positives causing missed calls.
            // IncomingCallService.startIncomingCall() is idempotent (isStarted guard).
            // Android suppresses the full-screen intent automatically when the app IS foreground.
            val intent = Intent(applicationContext, IncomingCallService::class.java).also {
                it.action = IncomingCallService.ACTION_START
                it.putExtra(IncomingCallService.EXTRA_CALL_ID,     callId)
                it.putExtra(IncomingCallService.EXTRA_CALLER_NAME, callerName)
                it.putExtra(IncomingCallService.EXTRA_CALL_TYPE,   callType)
                it.putExtra(IncomingCallService.EXTRA_NOTIF_BODY,  notifBody)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(applicationContext, intent)
            } else {
                applicationContext.startService(intent)
            }
        } else if (type == "call_dismissed") {
            // Il caller ha chiuso la chiamata — ferma subito lo squillo sul device del callee.
            // stopService chiama onDestroy → stopIncomingCall() senza problemi di foreground.
            Log.d(TAG, "→ call_dismissed: fermo IncomingCallService")
            applicationContext.stopService(Intent(applicationContext, IncomingCallService::class.java))
        } else {
            // Tutte le altre notifiche (like, follow, ecc.) → notifica di sistema base
            val title = remoteMessage.notification?.title ?: data["title"] ?: "SoundScape"
            val body  = remoteMessage.notification?.body  ?: data["body"]  ?: ""
            if (remoteMessage.notification == null && title == "SoundScape" && body.isBlank()) {
                Log.w(TAG, "Skipping blank fallback notification for data=$data")
                return
            }
            showFallbackNotification(title, body)
        }
    }

    private fun isAppInForeground(): Boolean {
        val manager = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return false
        val running = manager.runningAppProcesses ?: return false
        return running.any { process ->
            process.processName == packageName &&
                process.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
        }
    }

    // kept for the log line above — not used for routing decisions

    private fun showFallbackNotification(title: String, body: String) {
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            nm.createNotificationChannel(
                NotificationChannel(CHANNEL_DEFAULT, "Notifiche", NotificationManager.IMPORTANCE_DEFAULT)
            )
        }
        val notif = NotificationCompat.Builder(this, CHANNEL_DEFAULT)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .build()
        nm.notify(System.currentTimeMillis().toInt(), notif)
    }
}
