package com.cucucucucuione.soundscapemobile

import android.app.Activity
import android.app.PendingIntent
import android.app.PictureInPictureParams
import android.app.RemoteAction
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.drawable.Icon
import android.os.Build
import android.util.Rational
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.lang.ref.WeakReference

class CallPipModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private var pipReceiver: BroadcastReceiver? = null

    init {
        moduleRef = WeakReference(this)
    }

    override fun getName() = "CallPip"

    // Called by JS when a call becomes active / inactive.
    @ReactMethod
    fun setCallActive(active: Boolean, callerName: String, isMuted: Boolean) {
        isCallActive = active
        currentCallerName = callerName
        currentIsMuted = isMuted
        if (!active) unregisterReceiver()
    }

    // Called by JS to update the mute icon in the PiP controls.
    @ReactMethod
    fun updatePipActions(isMuted: Boolean) {
        currentIsMuted = isMuted
        val activity = reactApplicationContext.currentActivity ?: return
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        try {
            activity.setPictureInPictureParams(buildParams(activity))
        } catch (_: Exception) {}
    }

    // Register the broadcast receiver that forwards PiP button taps to JS.
    private fun registerReceiver() {
        if (pipReceiver != null) return
        val receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context, intent: Intent) {
                when (intent.action) {
                    ACTION_HANGUP -> emit("PipHangUp", null)
                    ACTION_MUTE   -> emit("PipMuteToggle", null)
                }
            }
        }
        val filter = IntentFilter().apply {
            addAction(ACTION_HANGUP)
            addAction(ACTION_MUTE)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            reactContext.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            reactContext.registerReceiver(receiver, filter)
        }
        pipReceiver = receiver
    }

    private fun unregisterReceiver() {
        try { pipReceiver?.let { reactContext.unregisterReceiver(it) } } catch (_: Exception) {}
        pipReceiver = null
    }

    fun emitPipModeChanged(isActive: Boolean) {
        val params = Arguments.createMap().apply { putBoolean("isActive", isActive) }
        emit("PipModeChanged", params)
    }

    private fun emit(name: String, data: Any?) {
        reactContext
            .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
            .emit(name, data)
    }

    @ReactMethod fun addListener(eventName: String) {}
    @ReactMethod fun removeListeners(count: Int) {}

    override fun invalidate() {
        unregisterReceiver()
        if (moduleRef?.get() === this) moduleRef = null
        super.invalidate()
    }

    companion object {
        const val ACTION_HANGUP = "com.cucucucucuione.soundscapemobile.PIP_HANGUP"
        const val ACTION_MUTE   = "com.cucucucucuione.soundscapemobile.PIP_MUTE"

        // Shared state read by MainActivity.onUserLeaveHint()
        @JvmField var isCallActive    = false
        @JvmField var currentCallerName = ""
        @JvmField var currentIsMuted  = false

        private var moduleRef: WeakReference<CallPipModule>? = null

        fun notifyPipModeChanged(isActive: Boolean) {
            moduleRef?.get()?.emitPipModeChanged(isActive)
        }

        // Called from MainActivity.onUserLeaveHint() — triggers PiP with smooth animation.
        fun enterPipIfActive(activity: Activity): Boolean {
            if (!isCallActive) return false
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
            return try {
                moduleRef?.get()?.registerReceiver()
                activity.enterPictureInPictureMode(buildParams(activity))
            } catch (_: Exception) { false }
        }

        private fun buildParams(context: Context): PictureInPictureParams {
            val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

            val hangupPi = PendingIntent.getBroadcast(
                context, 10, Intent(ACTION_HANGUP), flags
            )
            val mutePi = PendingIntent.getBroadcast(
                context, 11, Intent(ACTION_MUTE), flags
            )

            val hangupIcon = Icon.createWithResource(
                context, android.R.drawable.ic_menu_close_clear_cancel
            )
            val muteIcon = Icon.createWithResource(
                context,
                if (currentIsMuted) android.R.drawable.ic_btn_speak_now
                else android.R.drawable.stat_notify_call_mute
            )

            val muteLabel = if (currentIsMuted) "Attiva mic" else "Silenzia"

            val actions = listOf(
                RemoteAction(hangupIcon, "Riattacca", "Termina la chiamata", hangupPi),
                RemoteAction(muteIcon, muteLabel, muteLabel, mutePi),
            )

            val builder = PictureInPictureParams.Builder()
                .setActions(actions)
                .setAspectRatio(Rational(16, 9))

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                builder.setSeamlessResizeEnabled(true)
            }

            return builder.build()
        }
    }
}
