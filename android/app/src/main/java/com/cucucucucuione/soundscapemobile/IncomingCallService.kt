package com.cucucucucuione.soundscapemobile

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

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP    -> stopIncomingCall()
            ACTION_DECLINE -> {
                sendBroadcast(Intent(ACTION_DECLINED_BROADCAST).apply {
                    putExtra(EXTRA_CALL_ID, intent.getStringExtra(EXTRA_CALL_ID))
                })
                stopIncomingCall()
            }
            ACTION_ACCEPT  -> {
                sendBroadcast(Intent(ACTION_ACCEPTED_BROADCAST).apply {
                    putExtra(EXTRA_CALL_ID, intent.getStringExtra(EXTRA_CALL_ID))
                })
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
        acquireWakeLock()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification(callId, callerName))
        requestAudioFocus()
        startRingtone()
        startVibration()
    }

    private fun stopIncomingCall() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopRingtone(); stopVibration(); abandonAudioFocus(); releaseWakeLock(); stopSelf()
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
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val openPi       = PendingIntent.getActivity(this, 0, openIntent ?: Intent(), flags)
        val fullScreenPi = PendingIntent.getActivity(this, 1, openIntent ?: Intent(), flags)
        val acceptPi     = PendingIntent.getService(this, 2,
            Intent(this, IncomingCallService::class.java).apply { action = ACTION_ACCEPT; putExtra(EXTRA_CALL_ID, callId) }, flags)
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
        const val ACTION_ACCEPTED_BROADCAST = "com.cucucucucuione.soundscapemobile.CALL_ACCEPTED"
        const val ACTION_DECLINED_BROADCAST  = "com.cucucucucuione.soundscapemobile.CALL_DECLINED"
        const val EXTRA_CALL_ID     = "call_id"
        const val EXTRA_CALLER_NAME = "caller_name"
        private const val CHANNEL_ID      = "soundscape_incoming_call"
        private const val NOTIFICATION_ID = 7105
    }
}
