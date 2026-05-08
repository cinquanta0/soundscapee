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
import android.media.RingtoneManager
import android.media.Ringtone
import android.net.Uri
import android.os.Build
import android.os.IBinder
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import androidx.core.app.NotificationCompat

/**
 * IncomingCallService — shows a real full-screen incoming call notification
 * (like WhatsApp / Telegram) that:
 *  • wakes the screen via a WakeLock
 *  • plays the ringtone on STREAM_RING (respects the user's ring volume)
 *  • loops the ringtone indefinitely until answered/declined/timed-out
 *  • vibrates in the classic [0,800,500,800] call pattern
 *  • shows as a heads-up notification with full-screen intent
 *  • bypasses Do-Not-Disturb for the 'calls' channel
 */
class IncomingCallService : Service() {

    private var ringtone: Ringtone? = null
    private var audioManager: AudioManager? = null
    private var audioFocusRequest: AudioFocusRequest? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        when (intent?.action) {
            ACTION_STOP -> stopIncomingCall()
            ACTION_DECLINE -> {
                // User declined from notification — pass back to JS via broadcast
                val broadcast = Intent(ACTION_DECLINED_BROADCAST).apply {
                    putExtra(EXTRA_CALL_ID, intent.getStringExtra(EXTRA_CALL_ID))
                }
                sendBroadcast(broadcast)
                stopIncomingCall()
            }
            ACTION_ACCEPT -> {
                val broadcast = Intent(ACTION_ACCEPTED_BROADCAST).apply {
                    putExtra(EXTRA_CALL_ID, intent.getStringExtra(EXTRA_CALL_ID))
                }
                sendBroadcast(broadcast)
                stopIncomingCall()
            }
            else -> {
                val callId = intent?.getStringExtra(EXTRA_CALL_ID) ?: ""
                val callerName = intent?.getStringExtra(EXTRA_CALLER_NAME) ?: "Chiamata in arrivo"
                startIncomingCall(callId, callerName)
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        stopIncomingCall()
        super.onDestroy()
    }

    // ─── Start ────────────────────────────────────────────────────────────────

    private fun startIncomingCall(callId: String, callerName: String) {
        acquireWakeLock()
        createNotificationChannel()
        startForeground(NOTIFICATION_ID, buildNotification(callId, callerName))
        requestAudioFocus()
        startRingtone()
        startVibration()
    }

    // ─── Stop ─────────────────────────────────────────────────────────────────

    private fun stopIncomingCall() {
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopRingtone()
        stopVibration()
        abandonAudioFocus()
        releaseWakeLock()
        stopSelf()
    }

    // ─── Wake lock ────────────────────────────────────────────────────────────

    private fun acquireWakeLock() {
        val pm = getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        wakeLock = pm.newWakeLock(
            PowerManager.FULL_WAKE_LOCK or
            PowerManager.ACQUIRE_CAUSES_WAKEUP or
            PowerManager.ON_AFTER_RELEASE,
            "soundscape:incomingCall"
        ).apply { acquire(60_000L) } // max 60 s — call timeout
    }

    private fun releaseWakeLock() {
        try {
            wakeLock?.let { if (it.isHeld) it.release() }
        } catch (_: Exception) {}
        wakeLock = null
    }

    // ─── Ringtone on STREAM_RING ──────────────────────────────────────────────

    private fun startRingtone() {
        try {
            // Prefer our bundled soundscape_call.wav, fall back to system ringtone
            val uri: Uri = try {
                val resId = resources.getIdentifier("soundscape_call", "raw", packageName)
                if (resId != 0)
                    Uri.parse("android.resource://$packageName/$resId")
                else
                    RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            } catch (_: Exception) {
                RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            }

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

            // Make sure ring volume is not zero
            val am = getSystemService(Context.AUDIO_SERVICE) as? AudioManager
            if (am != null) {
                val currentVol = am.getStreamVolume(AudioManager.STREAM_RING)
                if (currentVol == 0) {
                    am.setStreamVolume(
                        AudioManager.STREAM_RING,
                        am.getStreamMaxVolume(AudioManager.STREAM_RING) / 2,
                        0
                    )
                }
            }

            rt.play()
        } catch (_: Exception) {}
    }

    private fun stopRingtone() {
        try { ringtone?.stop() } catch (_: Exception) {}
        ringtone = null
    }

    // ─── Audio focus ──────────────────────────────────────────────────────────

    private fun requestAudioFocus() {
        val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
        audioManager = manager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                        .build()
                )
                .setAcceptsDelayedFocusGain(false)
                .setOnAudioFocusChangeListener {}
                .build()
            audioFocusRequest = req
            manager.requestAudioFocus(req)
        } else {
            @Suppress("DEPRECATION")
            manager.requestAudioFocus(null, AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
        }
    }

    private fun abandonAudioFocus() {
        val manager = audioManager ?: return
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioFocusRequest?.let { manager.abandonAudioFocusRequest(it) }
            audioFocusRequest = null
        } else {
            @Suppress("DEPRECATION")
            manager.abandonAudioFocus(null)
        }
        audioManager = null
    }

    // ─── Vibration ────────────────────────────────────────────────────────────

    private fun startVibration() {
        val pattern = longArrayOf(0, 800, 500, 800, 500, 800)
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibrator = vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                vibrator = getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (_: Exception) {}
    }

    private fun stopVibration() {
        try { vibrator?.cancel() } catch (_: Exception) {}
        vibrator = null
    }

    // ─── Notification channel ─────────────────────────────────────────────────

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return

        // Channel for incoming call full-screen notifications
        // Sound is handled by the service itself (Ringtone on STREAM_RING),
        // so we silence the channel's own sound to avoid double-play.
        val channel = NotificationChannel(
            CHANNEL_ID,
            "Chiamate in arrivo",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Notifiche per chiamate vocali in arrivo"
            setSound(null, null)          // service handles sound via Ringtone API
            enableVibration(false)        // service handles vibration directly
            lockscreenVisibility = Notification.VISIBILITY_PUBLIC
            setShowBadge(true)
        }
        manager.createNotificationChannel(channel)
    }

    // ─── Notification ─────────────────────────────────────────────────────────

    private fun buildNotification(callId: String, callerName: String): Notification {
        // Tap notification → open app
        val openIntent = packageManager.getLaunchIntentForPackage(packageName)?.apply {
            flags = Intent.FLAG_ACTIVITY_SINGLE_TOP or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        val openPending = PendingIntent.getActivity(
            this, 0, openIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Full-screen intent — wakes screen and shows call UI even from lockscreen
        val fullScreenPending = PendingIntent.getActivity(
            this, 1, openIntent ?: Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Accept action
        val acceptIntent = Intent(this, IncomingCallService::class.java).apply {
            action = ACTION_ACCEPT
            putExtra(EXTRA_CALL_ID, callId)
        }
        val acceptPending = PendingIntent.getService(
            this, 2, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Decline action
        val declineIntent = Intent(this, IncomingCallService::class.java).apply {
            action = ACTION_DECLINE
            putExtra(EXTRA_CALL_ID, callId)
        }
        val declinePending = PendingIntent.getService(
            this, 3, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.mipmap.ic_launcher)
            .setContentTitle("📞 Chiamata in arrivo")
            .setContentText(callerName)
            .setSubText("SoundScape")
            .setOngoing(true)
            .setAutoCancel(false)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setFullScreenIntent(fullScreenPending, true)
            .setContentIntent(openPending)
            .addAction(
                android.R.drawable.ic_menu_call,
                "✅ Rispondi",
                acceptPending
            )
            .addAction(
                android.R.drawable.ic_delete,
                "❌ Rifiuta",
                declinePending
            )
            .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
            .setTimeoutAfter(60_000L) // auto-dismiss after 60s
            .build()
    }

    companion object {
        const val ACTION_START  = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_START"
        const val ACTION_STOP   = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_STOP"
        const val ACTION_ACCEPT = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_ACCEPT"
        const val ACTION_DECLINE = "com.cucucucucuione.soundscapemobile.action.INCOMING_CALL_DECLINE"

        // Broadcasts sent back to React Native
        const val ACTION_ACCEPTED_BROADCAST = "com.cucucucucuione.soundscapemobile.CALL_ACCEPTED"
        const val ACTION_DECLINED_BROADCAST  = "com.cucucucucuione.soundscapemobile.CALL_DECLINED"

        const val EXTRA_CALL_ID     = "call_id"
        const val EXTRA_CALLER_NAME = "caller_name"

        private const val CHANNEL_ID       = "soundscape_incoming_call"
        private const val NOTIFICATION_ID  = 7105
    }
}
