/**
 * withIncomingCall.js
 *
 * Expo config plugin that wires up the native Android IncomingCallService.
 * Mirrors the pattern used by withOutgoingRingback.js so EAS prebuild applies
 * all changes consistently before the Gradle build.
 *
 * What it does:
 *  1. Adds USE_FULL_SCREEN_INTENT permission to AndroidManifest.xml
 *  2. Declares IncomingCallService with foregroundServiceType="phoneCall"
 *  3. Writes IncomingCallService.kt, IncomingCallModule.kt, IncomingCallPackage.kt
 *  4. Adds IncomingCallPackage() to MainApplication.kt
 */
const fs   = require('fs');
const path = require('path');
const {
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

// ─── Kotlin source templates ──────────────────────────────────────────────────

const MODULE_KT = `package PACKAGE_NAME

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import androidx.core.content.ContextCompat
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule

class IncomingCallModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val broadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val callId = intent.getStringExtra(IncomingCallService.EXTRA_CALL_ID) ?: ""
            when (intent.action) {
                IncomingCallService.ACTION_ACCEPTED_BROADCAST -> emitEvent("IncomingCallAccepted", callId)
                IncomingCallService.ACTION_DECLINED_BROADCAST  -> emitEvent("IncomingCallDeclined", callId)
            }
        }
    }

    init {
        val filter = IntentFilter().apply {
            addAction(IncomingCallService.ACTION_ACCEPTED_BROADCAST)
            addAction(IncomingCallService.ACTION_DECLINED_BROADCAST)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(broadcastReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            reactContext.registerReceiver(broadcastReceiver, filter)
        }
    }

    override fun getName(): String = "IncomingCall"

    override fun invalidate() {
        try { reactContext.unregisterReceiver(broadcastReceiver) } catch (e: Exception) { /* ignore */ }
        super.invalidate()
    }

    @ReactMethod fun showIncomingCall(callId: String, callerName: String, promise: Promise) {
        try {
            val intent = Intent(reactContext, IncomingCallService::class.java).apply {
                action = IncomingCallService.ACTION_START
                putExtra(IncomingCallService.EXTRA_CALL_ID, callId)
                putExtra(IncomingCallService.EXTRA_CALLER_NAME, callerName)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ContextCompat.startForegroundService(reactContext, intent)
            } else {
                reactContext.startService(intent)
            }
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("incoming_call_start_failed", e) }
    }

    @ReactMethod fun dismissIncomingCall(promise: Promise) {
        try {
            val intent = Intent(reactContext, IncomingCallService::class.java).apply {
                action = IncomingCallService.ACTION_STOP
            }
            reactContext.startService(intent)
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("incoming_call_dismiss_failed", e) }
    }

    @ReactMethod fun addListener(eventName: String) { /* required by RN event emitter */ }
    @ReactMethod fun removeListeners(count: Int)    { /* required by RN event emitter */ }

    private fun emitEvent(eventName: String, callId: String) {
        val params = Arguments.createMap().apply { putString("callId", callId) }
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(eventName, params)
    }
}
`;

const PACKAGE_KT = `package PACKAGE_NAME

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager

class IncomingCallPackage : ReactPackage {
    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> =
        listOf(IncomingCallModule(reactContext))

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> =
        emptyList()
}
`;

const SERVICE_KT = `package PACKAGE_NAME

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
                if (resId != 0) Uri.parse("android.resource://\$packageName/\$resId")
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
        const val ACTION_START   = "PACKAGE_NAME.action.INCOMING_CALL_START"
        const val ACTION_STOP    = "PACKAGE_NAME.action.INCOMING_CALL_STOP"
        const val ACTION_ACCEPT  = "PACKAGE_NAME.action.INCOMING_CALL_ACCEPT"
        const val ACTION_DECLINE = "PACKAGE_NAME.action.INCOMING_CALL_DECLINE"
        const val ACTION_ACCEPTED_BROADCAST = "PACKAGE_NAME.CALL_ACCEPTED"
        const val ACTION_DECLINED_BROADCAST  = "PACKAGE_NAME.CALL_DECLINED"
        const val EXTRA_CALL_ID     = "call_id"
        const val EXTRA_CALLER_NAME = "caller_name"
        private const val CHANNEL_ID      = "soundscape_incoming_call"
        private const val NOTIFICATION_ID = 7105
    }
}
`;

// ─── Helper ───────────────────────────────────────────────────────────────────

function pkgToDir(pkg) { return pkg.split('.').join(path.sep); }
function writeIfChanged(filePath, contents) {
  if (fs.existsSync(filePath) && fs.readFileSync(filePath, 'utf8') === contents) return;
  fs.writeFileSync(filePath, contents);
}

// ─── 1. AndroidManifest — permission + service declaration ────────────────────

const withIncomingCallManifest = (config) =>
  withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;

    // Add USE_FULL_SCREEN_INTENT permission
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const hasFullScreen = manifest['uses-permission'].some(
      (p) => p.$?.['android:name'] === 'android.permission.USE_FULL_SCREEN_INTENT'
    );
    if (!hasFullScreen) {
      manifest['uses-permission'].push({ $: { 'android:name': 'android.permission.USE_FULL_SCREEN_INTENT' } });
    }

    // Declare IncomingCallService
    const app = manifest.application[0];
    if (!app.service) app.service = [];
    const hasService = app.service.some(
      (s) => s.$['android:name'] === '.IncomingCallService'
    );
    if (!hasService) {
      app.service.push({
        $: {
          'android:name': '.IncomingCallService',
          'android:exported': 'false',
          'android:foregroundServiceType': 'phoneCall',
          'android:stopWithTask': 'false',
        },
      });
    }

    return mod;
  });

// ─── 2. MainApplication — register IncomingCallPackage ───────────────────────

const withIncomingCallMainApplication = (config) =>
  withMainApplication(config, (mod) => {
    let contents = mod.modResults.contents;
    if (!contents.includes('IncomingCallPackage()')) {
      contents = contents.replace(
        /PackageList\(this\)\.packages\.apply \{/,
        'PackageList(this).packages.apply {\n              add(IncomingCallPackage())'
      );
    }
    mod.modResults.contents = contents;
    return mod;
  });

// ─── 3. Write Kotlin files ────────────────────────────────────────────────────

const withIncomingCallFiles = (config) =>
  withDangerousMod(config, [
    'android',
    async (mod) => {
      const androidRoot = mod.modRequest.platformProjectRoot;
      const packageName = config.android?.package;
      if (!packageName) throw new Error('android.package is required for withIncomingCall');

      const javaDir = path.join(androidRoot, 'app', 'src', 'main', 'java', pkgToDir(packageName));
      fs.mkdirSync(javaDir, { recursive: true });

      writeIfChanged(
        path.join(javaDir, 'IncomingCallModule.kt'),
        MODULE_KT.replaceAll('PACKAGE_NAME', packageName)
      );
      writeIfChanged(
        path.join(javaDir, 'IncomingCallPackage.kt'),
        PACKAGE_KT.replaceAll('PACKAGE_NAME', packageName)
      );
      writeIfChanged(
        path.join(javaDir, 'IncomingCallService.kt'),
        SERVICE_KT.replaceAll('PACKAGE_NAME', packageName)
      );

      return mod;
    },
  ]);

// ─── Export ───────────────────────────────────────────────────────────────────

module.exports = (config) => {
  config = withIncomingCallManifest(config);
  config = withIncomingCallMainApplication(config);
  config = withIncomingCallFiles(config);
  return config;
};
