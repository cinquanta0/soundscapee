package com.cucucucucuione.soundscapemobile

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Bundle
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity

class IncomingCallActivity : AppCompatActivity() {

    private var callId: String = ""
    private val pulseAnimations = mutableListOf<AnimatorSet>()

    private val dismissReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            finish()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Accendi lo schermo e mostra sopra il lock screen
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

        setContentView(R.layout.activity_incoming_call)

        callId = intent.getStringExtra(IncomingCallService.EXTRA_CALL_ID) ?: ""
        val callerName = intent.getStringExtra(IncomingCallService.EXTRA_CALLER_NAME)
            ?: "Chiamata in arrivo"

        // Nome chiamante
        findViewById<TextView>(R.id.tvCallerName).text = callerName

        // Avatar: prima lettera del nome con colore basato sull'hash
        val initial = callerName.trim().firstOrNull()?.uppercaseChar()?.toString() ?: "?"
        val avatarView = findViewById<TextView>(R.id.tvAvatar)
        avatarView.text = initial

        val avatarColors = arrayOf(
            "#4F46E5", "#7C3AED", "#9333EA", "#A855F7",
            "#EC4899", "#F97316", "#0EA5E9", "#14B8A6"
        )
        val colorHex = avatarColors[Math.abs(callerName.hashCode()) % avatarColors.size]
        (avatarView.background as? GradientDrawable)?.apply {
            mutate(); setColor(Color.parseColor(colorHex))
        }

        // Pulsante Rispondi
        findViewById<FrameLayout>(R.id.btnAccept).setOnClickListener {
            // Porta l'app in foreground
            packageManager.getLaunchIntentForPackage(packageName)?.apply {
                flags = Intent.FLAG_ACTIVITY_NEW_TASK or
                    Intent.FLAG_ACTIVITY_SINGLE_TOP or
                    Intent.FLAG_ACTIVITY_CLEAR_TOP
            }?.let { startActivity(it) }

            // Segnala accept al JS
            sendBroadcast(Intent(IncomingCallService.ACTION_ACCEPTED_BROADCAST).apply {
                putExtra(IncomingCallService.EXTRA_CALL_ID, callId)
            })
            stopService(Intent(this, IncomingCallService::class.java))
            finish()
        }

        // Pulsante Rifiuta
        findViewById<FrameLayout>(R.id.btnDecline).setOnClickListener {
            startService(Intent(this, IncomingCallService::class.java).apply {
                action = IncomingCallService.ACTION_DECLINE
                putExtra(IncomingCallService.EXTRA_CALL_ID, callId)
            })
            finish()
        }

        startPulse()
        registerDismissReceiver()
    }

    private fun startPulse() {
        val ring1 = findViewById<View>(R.id.pulseRing1)
        val ring2 = findViewById<View>(R.id.pulseRing2)
        val interp = AccelerateDecelerateInterpolator()

        listOf(ring1 to 600L, ring2 to 0L).forEach { (view, delay) ->
            val sx = ObjectAnimator.ofFloat(view, "scaleX", 0.72f, 1.12f)
            val sy = ObjectAnimator.ofFloat(view, "scaleY", 0.72f, 1.12f)
            val al = ObjectAnimator.ofFloat(view, "alpha", 0.65f, 0f)
            listOf(sx, sy, al).forEach { a ->
                a.duration = 1800
                a.startDelay = delay
                a.repeatCount = ObjectAnimator.INFINITE
                a.repeatMode = ObjectAnimator.RESTART
                a.interpolator = interp
            }
            val set = AnimatorSet().also { it.playTogether(sx, sy, al) }
            pulseAnimations.add(set)
            set.start()
        }
    }

    private fun registerDismissReceiver() {
        val filter = IntentFilter().apply {
            addAction(IncomingCallService.ACTION_ACCEPTED_BROADCAST)
            addAction(IncomingCallService.ACTION_DECLINED_BROADCAST)
            addAction(IncomingCallService.ACTION_DISMISS_ACTIVITY)
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(dismissReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(dismissReceiver, filter)
        }
    }

    override fun onDestroy() {
        pulseAnimations.forEach { it.cancel() }
        try { unregisterReceiver(dismissReceiver) } catch (_: Exception) {}
        super.onDestroy()
    }
}
