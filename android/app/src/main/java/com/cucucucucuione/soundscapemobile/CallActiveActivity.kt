package com.cucucucucuione.soundscapemobile

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

// Safety fallback activity — normally MainActivity handles the lock screen directly
// (IncomingCallActivity now passes showOverLockScreen=true to MainActivity).
// If this activity is ever launched it simply opens the main app immediately, no PIN prompt.
class CallActiveActivity : AppCompatActivity() {

    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) { finish() }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
        }
        @Suppress("DEPRECATION")
        window.addFlags(
            WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON or
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
        )

        setContentView(R.layout.activity_call_active)

        val callerName = intent.getStringExtra(IncomingCallService.EXTRA_CALLER_NAME) ?: ""
        val callId     = intent.getStringExtra(IncomingCallService.EXTRA_CALL_ID) ?: ""

        findViewById<TextView>(R.id.tvActiveCallerName).text = callerName
        findViewById<TextView>(R.id.tvCallDuration)?.text = "Chiamata in corso"

        findViewById<FrameLayout>(R.id.btnHangUp).setOnClickListener {
            sendBroadcast(Intent(IncomingCallService.ACTION_HANG_UP_FROM_LOCKSCREEN).apply {
                putExtra(IncomingCallService.EXTRA_CALL_ID, callId)
            })
            finish()
        }

        registerCallEndedReceiver()

        // Redirect to main app immediately — no PIN dialog
        openMainAppAndFinish()
    }

    override fun onResume() {
        super.onResume()
        openMainAppAndFinish()
    }

    private fun openMainAppAndFinish() {
        packageManager.getLaunchIntentForPackage(packageName)?.apply {
            this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("showOverLockScreen", true)
        }?.let { startActivity(it) }
        finish()
    }

    private fun registerCallEndedReceiver() {
        val filter = IntentFilter(IncomingCallService.ACTION_CALL_ENDED_BROADCAST)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callEndedReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(callEndedReceiver, filter)
        }
    }

    override fun onDestroy() {
        try { unregisterReceiver(callEndedReceiver) } catch (_: Exception) {}
        super.onDestroy()
    }
}
