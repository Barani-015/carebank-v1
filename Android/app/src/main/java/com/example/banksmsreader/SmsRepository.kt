package com.example.banksmsreader

import android.content.Context
import android.net.Uri
import android.util.Log
import com.example.banksmsreader.SmsProcessor

class SmsRepository {

    fun readInbox(context: Context) {

        try {

            val uri = Uri.parse("content://sms/inbox")

            val cursor = context.contentResolver.query(
                uri,
                arrayOf("body", "address"), // fetch only needed columns (safer)
                null,
                null,
                "date DESC"
            )

            cursor?.use {

                while (it.moveToNext()) {

                    val body = it.getString(it.getColumnIndexOrThrow("body"))
                    val address = it.getString(it.getColumnIndexOrThrow("address"))

                    SmsProcessor.processSms(address ?: "", body ?: "")
                }
            }

        } catch (e: Exception) {
            Log.e("INBOX_ERROR", e.message ?: "Unknown error")
        }
    }
}