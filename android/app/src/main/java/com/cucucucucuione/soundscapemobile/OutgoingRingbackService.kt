package com.cucucucucuione.soundscapemobile

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat

class OutgoingRingbackService : Service() {
  private var player: MediaPlayer? = null
  private var audioManager: AudioManager? = null
  private var audioFocusRequest: AudioFocusRequest? = null

  override fun onBind(intent: Intent?): IBinder? = null

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_STOP -> stopRingback()
      ACTION_START -> startRingback()
      else -> startRingback()
    }
    return START_NOT_STICKY
  }

  override fun onDestroy() {
    stopPlayer()
    abandonAudioFocus()
    super.onDestroy()
  }

  private fun startRingback() {
    createNotificationChannel()
    startForeground(NOTIFICATION_ID, buildNotification())
    requestAudioFocus()
    if (player?.isPlaying == true) return

    val resId = resources.getIdentifier("soundscape_call", "raw", packageName)
    if (resId == 0) {
      stopSelf()
      return
    }

    val afd = resources.openRawResourceFd(resId)
    if (afd == null) {
      stopSelf()
      return
    }

    player = MediaPlayer().apply {
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
          setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
              .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
              .build(),
          )
        } else {
          @Suppress("DEPRECATION")
          setAudioStreamType(AudioManager.STREAM_VOICE_CALL)
        }
        setDataSource(afd.fileDescriptor, afd.startOffset, afd.length)
        afd.close()
        isLooping = true
        setVolume(1f, 1f)
        prepare()
        start()
      } catch (_: Exception) {
        try {
          reset()
          release()
        } catch (_: Exception) {}
        player = null
        stopSelf()
      }
    }
  }

  private fun stopRingback() {
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopPlayer()
    abandonAudioFocus()
    stopSelf()
  }

  private fun stopPlayer() {
    player?.run {
      try {
        if (isPlaying) stop()
      } catch (_: Exception) {}
      reset()
      release()
    }
    player = null
  }

  private fun requestAudioFocus() {
    val manager = getSystemService(Context.AUDIO_SERVICE) as? AudioManager ?: return
    audioManager = manager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val request = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT)
        .setAudioAttributes(
          AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION_SIGNALLING)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build(),
        )
        .setAcceptsDelayedFocusGain(false)
        .setOnAudioFocusChangeListener { }
        .build()
      audioFocusRequest = request
      manager.requestAudioFocus(request)
    } else {
      @Suppress("DEPRECATION")
      manager.requestAudioFocus(
        null,
        AudioManager.STREAM_VOICE_CALL,
        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT,
      )
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

  private fun createNotificationChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = getSystemService(NotificationManager::class.java) ?: return
    val channel = NotificationChannel(
      CHANNEL_ID,
      "SoundScape Call Audio",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "Riproduzione della suoneria di chiamata in uscita"
      setSound(null, null)
      enableVibration(false)
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }

  private fun buildNotification(): Notification =
    NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Chiamata in corso")
      .setContentText("Sto contattando l'altra persona...")
      .setOngoing(true)
      .setSilent(true)
      .setCategory(NotificationCompat.CATEGORY_CALL)
      .setForegroundServiceBehavior(NotificationCompat.FOREGROUND_SERVICE_IMMEDIATE)
      .setOnlyAlertOnce(true)
      .build()

  companion object {
    const val ACTION_START = "com.cucucucucuione.soundscapemobile.action.START_RINGBACK"
    const val ACTION_STOP = "com.cucucucucuione.soundscapemobile.action.STOP_RINGBACK"
    private const val CHANNEL_ID = "soundscape_outgoing_ringback"
    private const val NOTIFICATION_ID = 7104
  }
}
