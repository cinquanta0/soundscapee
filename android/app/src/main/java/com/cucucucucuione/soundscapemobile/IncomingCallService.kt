package com.cucucucucuione.soundscapemobile

import android.app.KeyguardManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.Ringtone
import android.media.RingtoneManager
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

class IncomingCallService : Service() {

    private var ringtone: Ringtone? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null
    private var isStarted = false

    private val handler = android.os.Handler(android.os.Looper.getMainLooper())
    private val ringTimeoutRunnable = Runnable { stopIncomingCall() }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP    -> stopIncomingCall()
            ACTION_DECLINE -> {
                val callId = intent.getStringExtra(EXTRA_CALL_ID) ?: ""
                if (callId.isNotBlank()) {
                    getSharedPreferences("IncomingCall", Context.MODE_PRIVATE)
                        .edit().putString("pendingDeclineCallId", callId).apply()
                    markCallDeclinedViaRest(callId)
                }
                sendBroadcast(Intent(ACTION_DECLINED_BROADCAST).apply {
                    putExtra(EXTRA_CALL_ID, callId)
                    setPackage(packageName)
                })
                stopIncomingCall()
            }
            ACTION_ACCEPT  -> {
                // Legacy path kept for safety — notification button now goes directly to
                // MainActivity via PendingIntent.getActivity() (see buildNotification).
                stopIncomingCall()
            }
            else -> {
                val callId     = intent?.getStringExtra(EXTRA_CALL_ID) ?: ""
                val callerName = intent?.getStringExtra(EXTRA_CALLER_NAME) ?: "Chiamata in arrivo"
                startIncomingCall(callId, callerName)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() { stopIncomingCall(); super.onDestroy() }

    private fun startIncomingCall(callId: String, callerName: String) {
        if (isStarted) return
        isStarted = true
        // Auto-stop after 50s: covers the case where the caller cancels while the
        // callee's app is killed (no JS Firestore listener to call dismissIncomingCall).
        handler.postDelayed(ringTimeoutRunnable, 50_000L)
        acquireWakeLock()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification(callId, callerName))
        requestAudioFocus()
        startRingtone()
        startVibration()
        // Lancia l'activity direttamente — fallback per dispositivi (es. Xiaomi HyperOS)
        // che non triggerano il fullScreenIntent automaticamente con schermo spento.
        try {
            startActivity(Intent(this, IncomingCallActivity::class.java).apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION
                putExtra(EXTRA_CALL_ID, callId)
                putExtra(EXTRA_CALLER_NAME, callerName)
            })
        } catch (_: Exception) {}
    }

    private fun stopIncomingCall() {
        isStarted = false
        handler.removeCallbacks(ringTimeoutRunnable)
        sendBroadcast(Intent(ACTION_DISMISS_ACTIVITY).setPackage(packageName))
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopRingtone(); stopVibration(); abandonAudioFocus(); releaseWakeLock(); stopSelf()
    }

    private fun markCallDeclinedViaRest(callId: String) {
        val prefs = getSharedPreferences("IncomingCall", Context.MODE_PRIVATE)
        val idToken = prefs.getString("authIdToken", null) ?: return
        Thread {
            try {
                val token = if (isTokenExpired(idToken)) {
                    val refreshToken = prefs.getString("authRefreshToken", null) ?: return@Thread
                    refreshIdToken(refreshToken) ?: return@Thread
                } else idToken
                patchCallStatus(callId, token)
            } catch (_: Exception) {}
        }.start()
    }

    private fun patchCallStatus(callId: String, token: String) {
        val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", java.util.Locale.US)
        sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
        val body = """{"fields":{"status":{"stringValue":"declined"},"endedAt":{"timestampValue":"${sdf.format(java.util.Date())}"}}}"""
        val url = java.net.URL(
            "https://firestore.googleapis.com/v1/projects/soundscape-74397" +
            "/databases/(default)/documents/calls/$callId" +
            "?updateMask.fieldPaths=status&updateMask.fieldPaths=endedAt"
        )
        with(url.openConnection() as java.net.HttpURLConnection) {
            requestMethod = "PATCH"
            setRequestProperty("Authorization", "Bearer $token")
            setRequestProperty("Content-Type", "application/json")
            doOutput = true
            outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            responseCode
            disconnect()
        }
    }

    private fun isTokenExpired(idToken: String): Boolean {
        return try {
            val parts = idToken.split(".")
            if (parts.size < 2) return true
            val payload = String(android.util.Base64.decode(
                parts[1].padEnd((parts[1].length + 3) / 4 * 4, '='),
                android.util.Base64.URL_SAFE or android.util.Base64.NO_PADDING
            ))
            val exp = org.json.JSONObject(payload).optLong("exp", 0L)
            exp < System.currentTimeMillis() / 1000 + 60
        } catch (_: Exception) { true }
    }

    private fun refreshIdToken(refreshToken: String): String? {
        return try {
            val body = "grant_type=refresh_token&refresh_token=${java.net.URLEncoder.encode(refreshToken, "UTF-8")}"
            val url = java.net.URL("https://securetoken.googleapis.com/v1/token?key=AIzaSyAvBTHZ4mlSEbUTHYaU9Tkg6q4CXL4nrzc")
            with(url.openConnection() as java.net.HttpURLConnection) {
                requestMethod = "POST"
                setRequestProperty("Content-Type", "application/x-www-form-urlencoded")
                doOutput = true
                outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
                if (responseCode == 200) {
                    val json = org.json.JSONObject(inputStream.bufferedReader().readText())
                    val newIdToken = json.optString("id_token").takeIf { it.isNotBlank() }
                    val newRefresh = json.optString("refresh_token").takeIf { it.isNotBlank() }
                    // Aggiorna il token salvato per la prossima volta
                    if (newIdToken != null && newRefresh != null) {
                        getSharedPreferences("IncomingCall", Context.MODE_PRIVATE).edit()
                            .putString("authIdToken", newIdToken)
                            .putString("authRefreshToken", newRefresh)
                            .apply()
                    }
                    disconnect()
                    newIdToken
                } else { disconnect(); null }
            }
        } catch (_: Exception) { null }
    }

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
            "soundscape:incomingCall"
        ).apply { acquire(60_000L) }
    }

    private fun releaseWakeLock() {
        try { wakeLock?.let { if (it.isHeld) it.release() } } catch (e: Exception) { /* ignore */ }
        wakeLock = null
    }

    private fun startRingtone() {
        try {
            val uri: Uri = try {
                val resId = resources.getIdentifier("soundscape_call", "raw", packageName)
                if (resId != 0) Uri.parse("android.resource://$packageName/$resId")
                else RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            } catch (e: Exception) { RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE) }

            val rt = RingtoneManager.getRingtone(applicationContext, uri) ?: return
            ringtone = rt
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                rt.isLooping = true
                rt.audioAttributes = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            } else {
                @Suppress("DEPRECATION")
                rt.streamType = AudioManager.STREAM_RING
            }
            rt.play()
        } catch (e: Exception) { /* ignore */ }
    }

    private fun stopRingtone() {
        try { ringtone?.stop() } catch (e: Exception) { /* ignore */ }
        ringtone = null
    }

    private fun requestAudioFocus() {
        val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = manager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build())
                .setAcceptsDelayedFocusGain(false).setOnAudioFocusChangeListener {}.build()
            audioFocusRequest = req; manager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(null, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        }
    }

    private fun abandonAudioFocus() {
        val manager = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }; audioFocusRequest = null
        } else {
            @Suppress("DEPRECATION") manager.abandonAudioFocus(null)
        }
        audioManager = null
    }

    private fun startVibration() {
        val pattern = longArrayOf(0, 800, 500, 800, 500, 800)
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                (getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION") vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) { /* ignore */ }
    }

    private fun stopVibration() {
        try { vibrator?.cancel() } catch (e: Exception) { /* ignore */ }
        vibrator = null
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val ch = NotificationChannel(CHANNEL_ID, "Chiamate in arrivo", NotificationManager.IMPORTANCE_HIGH).apply {
            description = "Notifiche per chiamate vocali in arrivo"
            setSound(null, null); enableVibration(false)
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC; setShowBadge(true)
        }
        manager.createNotificationChannel(ch)
    }

    private fun buildNotification(callId: String, callerName: String): Notification {
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            this.flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val callScreenIntent = Intent(this, IncomingCallActivity::class.java).apply {
            this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_USER_ACTION
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_CALLER_NAME, callerName)
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val openPi       = PendingIntent.getActivity(this, 0, openIntent ?: Intent(), flags)
        val fullScreenPi = PendingIntent.getActivity(this, 1, callScreenIntent, flags)
        // Use getActivity so Android grants BAL privilege — getService() is blocked on API 29+.
        val acceptMainIntent = (packageManager.getLaunchIntentForPackage(packageName) ?: Intent()).apply {
            this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("showOverLockScreen", true)
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_ACCEPT_FROM_NOTIFICATION, true)
        }
        val acceptPi     = PendingIntent.getActivity(this, 2, acceptMainIntent, flags)
        val declinePi    = PendingIntent.getService(this, 3,
            Intent(this, IncomingCallService::class.java).apply { action = ACTION_DECLINE; putExtra(EXTRA_CALL_ID, callId) }, flags)

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("Chiamata in arrivo").setContentText(callerName).setSubText("SoundScape")
            .setOngoing(true).setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_MAX).setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPi, true).setContentIntent(openPi)
            .addAction(android.R.drawable.ic_menu_call, "Rispondi", acceptPi)
            .addAction(android.R.drawable.ic_delete,    "Rifiuta",  declinePi)
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setTimeoutAfter(60_000L).build()
    }

    companion object {
        const val ACTION_START   = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_START"
        const val ACTION_STOP    = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_STOP"
        const val ACTION_ACCEPT  = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_ACCEPT"
        const val ACTION_DECLINE = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_DECLINE"
        const val ACTION_ACCEPTED_BROADCAST      = "com.cucucucucuione.soundscapemobile.CALL_ACCEPTED"
        const val ACTION_DECLINED_BROADCAST      = "com.cucucucucuione.soundscapemobile.CALL_DECLINED"
        const val ACTION_DISMISS_ACTIVITY        = "com.cucucucucuione.soundscapemobile.DISMISS_INCOMING_ACTIVITY"
        const val ACTION_CALL_ENDED_BROADCAST    = "com.cucucucucuione.soundscapemobile.CALL_ENDED"
        const val ACTION_HANG_UP_FROM_LOCKSCREEN = "com.cucucucucuione.soundscapemobile.HANG_UP_LOCKSCREEN"
        const val EXTRA_CALL_ID                  = "call_id"
        const val EXTRA_CALLER_NAME              = "caller_name"
        const val EXTRA_ACCEPT_FROM_NOTIFICATION = "acceptFromNotification"
        private const val CHANNEL_ID      = "soundscape_incoming_call"
        private const val NOTIFICATION_ID = 7105
    }
}
