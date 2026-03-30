package com.example.banksmsreader

import android.app.Service
import android.content.Intent
import android.os.IBinder

class SmsProcessingService : Service() {

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        // Process SMS in background if needed
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null
}