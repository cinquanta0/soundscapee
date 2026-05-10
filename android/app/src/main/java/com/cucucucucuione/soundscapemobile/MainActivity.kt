package com.cucucucucuione.soundscapemobile
import expo.modules.splashscreen.SplashScreenManager

import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.view.WindowManager

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

import expo.modules.ReactActivityDelegateWrapper

class MainActivity : ReactActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    handleShowWhenLocked(intent)
    // @generated begin expo-splashscreen - expo prebuild (DO NOT MODIFY) sync-f3ff59a738c56c9a6119210cb55f0b613eb8b6af
    SplashScreenManager.registerOnActivity(this)
    // @generated end expo-splashscreen
    super.onCreate(null)
    handleNotificationAccept(intent)
  }

  override fun onNewIntent(intent: Intent) {
    super.onNewIntent(intent)
    handleShowWhenLocked(intent)
    handleNotificationAccept(intent)
  }

  // Triggers PiP when the user presses home/recents while a call is active.
  override fun onUserLeaveHint() {
    super.onUserLeaveHint()
    CallPipModule.enterPipIfActive(this)
  }

  override fun onPictureInPictureModeChanged(
    isInPictureInPictureMode: Boolean,
    newConfig: Configuration,
  ) {
    super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
    CallPipModule.notifyPipModeChanged(isInPictureInPictureMode)
  }

  // Handles the "Rispondi" notification button — saves accept state and stops the ringtone.
  // The notification button uses PendingIntent.getActivity() pointing here, which grants
  // Background Activity Launch privilege (PendingIntent.getService() is blocked on API 29+).
  private fun handleNotificationAccept(intent: Intent?) {
    if (intent?.getBooleanExtra(IncomingCallService.EXTRA_ACCEPT_FROM_NOTIFICATION, false) != true) return
    val callId = intent.getStringExtra(IncomingCallService.EXTRA_CALL_ID) ?: return
    getSharedPreferences("IncomingCall", android.content.Context.MODE_PRIVATE)
      .edit().putString("pendingAcceptCallId", callId).apply()
    sendBroadcast(Intent(IncomingCallService.ACTION_ACCEPTED_BROADCAST).apply {
      putExtra(IncomingCallService.EXTRA_CALL_ID, callId)
      setPackage(packageName)
    })
    try {
      startService(Intent(this, IncomingCallService::class.java).apply {
        action = IncomingCallService.ACTION_STOP
      })
    } catch (_: Exception) {}
  }

  // Shows the React Native app over the lock screen without requiring PIN,
  // so the user can answer and talk immediately after tapping "Rispondi".
  private fun handleShowWhenLocked(intent: Intent?) {
    if (intent?.getBooleanExtra("showOverLockScreen", false) != true) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      setShowWhenLocked(true)
      setTurnScreenOn(true)
    }
    @Suppress("DEPRECATION")
    window.addFlags(
      WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
        WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
        WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
    )
  }

  override fun getMainComponentName(): String = "main"

  override fun createReactActivityDelegate(): ReactActivityDelegate {
    return ReactActivityDelegateWrapper(
          this,
          BuildConfig.IS_NEW_ARCHITECTURE_ENABLED,
          object : DefaultReactActivityDelegate(
              this,
              mainComponentName,
              fabricEnabled
          ){})
  }

  override fun invokeDefaultOnBackPressed() {
      if (Build.VERSION.SDK_INT <= Build.VERSION_CODES.R) {
          if (!moveTaskToBack(false)) {
              super.invokeDefaultOnBackPressed()
          }
          return
      }
      super.invokeDefaultOnBackPressed()
  }
}
