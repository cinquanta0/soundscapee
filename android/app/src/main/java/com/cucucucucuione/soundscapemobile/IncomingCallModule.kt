package com.cucucucucuione.soundscapemobile

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
                IncomingCallService.ACTION_ACCEPTED_BROADCAST      -> emitEvent("IncomingCallAccepted", callId)
                IncomingCallService.ACTION_DECLINED_BROADCAST      -> emitEvent("IncomingCallDeclined", callId)
                IncomingCallService.ACTION_HANG_UP_FROM_LOCKSCREEN -> emitEvent("CallHangUpFromLockScreen", callId)
            }
        }
    }

    init {
        val filter = IntentFilter().apply {
            addAction(IncomingCallService.ACTION_ACCEPTED_BROADCAST)
            addAction(IncomingCallService.ACTION_DECLINED_BROADCAST)
            addAction(IncomingCallService.ACTION_HANG_UP_FROM_LOCKSCREEN)
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

    @ReactMethod fun notifyCallEnded(promise: Promise) {
        try {
            reactContext.sendBroadcast(Intent(IncomingCallService.ACTION_CALL_ENDED_BROADCAST))
            promise.resolve(null)
        } catch (e: Exception) { promise.reject("notify_call_ended_failed", e) }
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
