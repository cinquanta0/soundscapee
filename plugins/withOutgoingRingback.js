const fs = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const MODULE = `package PACKAGE_NAME

import android.content.Intent
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod

class OutgoingRingbackModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName(): String = "OutgoingRingback"

  @ReactMethod
  fun start(promise: Promise) {
    try {
      val intent = Intent(reactContext, OutgoingRingbackService::class.java).apply {
        action = OutgoingRingbackService.ACTION_START
      }
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        ContextCompat.startForegroundService(reactContext, intent)
      } else {
        reactContext.startService(intent)
      }
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ringback_start_failed", e)
    }
  }

  @ReactMethod
  fun stop(promise: Promise) {
    try {
      val intent = Intent(reactContext, OutgoingRingbackService::class.java).apply {
        action = OutgoingRingbackService.ACTION_STOP
      }
      reactContext.startService(intent)
      promise.resolve(null)
    } catch (e: Exception) {
      promise.reject("ringback_stop_failed", e)
    }
  }
}
`;

const PACKAGE = `package PACKAGE_NAME

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class OutgoingRingbackPackage : ReactPackage {
  override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
    listOf(OutgoingRingbackModule(reactContext))

  override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
    emptyList()
}
`;

const SERVICE = `package PACKAGE_NAME

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
      "MIUSLYK Call Audio",
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
    const val ACTION_START = "PACKAGE_NAME.action.START_RINGBACK"
    const val ACTION_STOP = "PACKAGE_NAME.action.STOP_RINGBACK"
    private const val CHANNEL_ID = "soundscape_outgoing_ringback"
    private const val NOTIFICATION_ID = 7104
  }
}
`;

function packageToDir(pkg) {
  return pkg.split('.').join(path.sep);
}

function writeIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.writeFileSync(filePath, contents);
}

const withOutgoingRingbackManifest = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    const app = manifest.application[0];
    if (!app.service) app.service = [];

    const hasService = app.service.some(
      (service) => service.$['android:name'] === '.OutgoingRingbackService',
    );

    if (!hasService) {
      app.service.push({
        $: {
          'android:name': '.OutgoingRingbackService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'mediaPlayback',
        },
      });
    }

    return mod;
  });

const withOutgoingRingbackMainApplication = (config) =>
  withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('OutgoingRingbackPackage()')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        'PackageList(this).packages.apply {\n              add(OutgoingRingbackPackage())',
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });

const withOutgoingRingbackFiles = (config) =>
  withDangerousMod(config, [
    'android',
    async (mod) => {
      const androidRoot = mod.modRequest.platformProjectRoot;
      const packageName = config.android?.package;
      if (!packageName) throw new Error('android.package is required for withOutgoingRingback');

      const javaDir = path.join(androidRoot, 'app', 'src', 'main', 'java', packageToDir(packageName));
      const rawDir = path.join(androidRoot, 'app', 'src', 'main', 'res', 'raw');

      fs.mkdirSync(javaDir, { recursive: true });
      fs.mkdirSync(rawDir, { recursive: true });

      writeIfChanged(
        path.join(javaDir, 'OutgoingRingbackModule.kt'),
        MODULE.replaceAll('PACKAGE_NAME', packageName),
      );
      writeIfChanged(
        path.join(javaDir, 'OutgoingRingbackPackage.kt'),
        PACKAGE.replaceAll('PACKAGE_NAME', packageName),
      );
      writeIfChanged(
        path.join(javaDir, 'OutgoingRingbackService.kt'),
        SERVICE.replaceAll('PACKAGE_NAME', packageName),
      );

      const srcSound = path.join(mod.modRequest.projectRoot, 'assets', 'sounds', 'soundscape_call.wav');
      const dstSound = path.join(rawDir, 'soundscape_call.wav');
      fs.copyFileSync(srcSound, dstSound);

      return mod;
    },
  ]);

module.exports = (config) => {
  config = withOutgoingRingbackManifest(config);
  config = withOutgoingRingbackMainApplication(config);
  config = withOutgoingRingbackFiles(config);
  return config;
};
