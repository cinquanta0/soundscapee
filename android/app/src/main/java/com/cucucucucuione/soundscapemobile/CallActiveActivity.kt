package com.cucucucucuione.soundscapemobile

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class CallActiveActivity : AppCompatActivity() {

    private var secondsElapsed = 0
    private val handler = Handler(Looper.getMainLooper())
    private val timerRunnable = object : Runnable {
        override fun run() {
            secondsElapsed++
            val m = secondsElapsed / 60
            val s = secondsElapsed % 60
            findViewById<TextView>(R.id.tvCallDuration)?.text =
                String.format("%02d:%02d", m, s)
            handler.postDelayed(this, 1000)
        }
    }

    private val callEndedReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) { finish() }
    }

    private val userPresentReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) { openMainAppAndFinish() }
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
        findViewById<TextView>(R.id.tvCallDuration).text = "00:00"

        findViewById<FrameLayout>(R.id.btnHangUp).setOnClickListener {
            sendBroadcast(Intent(IncomingCallService.ACTION_HANG_UP_FROM_LOCKSCREEN).apply {
                putExtra(IncomingCallService.EXTRA_CALL_ID, callId)
            })
            finish()
        }

        handler.postDelayed(timerRunnable, 1000)
        registerCallEventReceiver()
    }

    override fun onResume() {
        super.onResume()
        // On devices without screen security (no PIN/pattern/biometric),
        // ACTION_USER_PRESENT never fires on swipe-only lock screens on some OEMs.
        // Go directly to the app so the user doesn't get stuck on this overlay.
        val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
        if (km?.isKeyguardSecure == false) {
            openMainAppAndFinish()
        }
    }

    private fun openMainAppAndFinish() {
        packageManager.getLaunchIntentForPackage(packageName)?.apply {
            this.flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                Intent.FLAG_ACTIVITY_SINGLE_TOP or
                Intent.FLAG_ACTIVITY_CLEAR_TOP
        }?.let { startActivity(it) }
        finish()
    }

    private fun registerCallEventReceiver() {
        val endedFilter = IntentFilter(IncomingCallService.ACTION_CALL_ENDED_BROADCAST)
        val userPresentFilter = IntentFilter(Intent.ACTION_USER_PRESENT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callEndedReceiver, endedFilter, Context.RECEIVER_NOT_EXPORTED)
            registerReceiver(userPresentReceiver, userPresentFilter, Context.RECEIVER_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(callEndedReceiver, endedFilter)
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(userPresentReceiver, userPresentFilter)
        }
    }

    override fun onDestroy() {
        handler.removeCallbacks(timerRunnable)
        try { unregisterReceiver(callEndedReceiver) } catch (_: Exception) {}
        try { unregisterReceiver(userPresentReceiver) } catch (_: Exception) {}
        super.onDestroy()
    }
}
