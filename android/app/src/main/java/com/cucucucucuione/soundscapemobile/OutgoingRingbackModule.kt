package com.cucucucucuione.soundscapemobile

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
