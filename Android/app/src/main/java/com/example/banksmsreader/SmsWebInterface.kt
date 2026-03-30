package com.example.banksmsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.provider.Telephony
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.localbroadcastmanager.content.LocalBroadcastManager
import org.json.JSONArray
import org.json.JSONObject

class SmsWebInterface(
    private val context: Context,
    private val contentResolver: android.content.ContentResolver
) {

    private var webView: WebView? = null
    private val smsMap = LinkedHashMap<Long, BankSmsMessage>()
    private val localBroadcastManager = LocalBroadcastManager.getInstance(context)

    init {
        registerSmsReceiver()
    }

    fun setWebView(webView: WebView) {
        this.webView = webView
    }

    private fun registerSmsReceiver() {
        val filter = IntentFilter("NEW_SMS_RECEIVED")
        localBroadcastManager.registerReceiver(smsBroadcastReceiver, filter)
    }

    private val smsBroadcastReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            if (intent.action == "NEW_SMS_RECEIVED") {
                val id = intent.getLongExtra("sms_id", System.currentTimeMillis())
                val sender = intent.getStringExtra("sender") ?: "Unknown"
                val body = intent.getStringExtra("body") ?: ""
                val timestamp = intent.getLongExtra("timestamp", System.currentTimeMillis())

                val newSms = BankSmsMessage(
                    id = id,
                    address = sender,
                    body = body,
                    date = timestamp,
                    type = 1
                )

                // FIXED: Use isRelevantMessage() instead of isBankTransaction()
                if (newSms.isRelevantMessage() && newSms.parseAmount() != null) {
                    smsMap[id] = newSms

                    try {
                        val json = JSONObject().apply {
                            put("id", newSms.id)
                            put("merchant", newSms.parseMerchant())
                            put("date", newSms.getFormattedDate())
                            put("category", newSms.getCategory())
                            put("status", newSms.getStatus())
                            put("type", newSms.getTransactionType())
                            put("amount", newSms.parseAmount() ?: 0.0)

                            // Add Union Bank specific fields if applicable
                            if (newSms.isUnionBankMessage()) {
                                put("balance", newSms.parseBalance() ?: 0.0)
                                put("refNumber", newSms.parseReferenceNumber())
                                put("txnDate", newSms.parseTransactionDate())
                                put("messageType", "UNION_BANK")
                            } else if (newSms.isRechargeMessage()) {
                                put("messageType", "RECHARGE")
                            }
                        }.toString().replace("\\", "\\\\").replace("'", "\\'")

                        webView?.post {
                            webView?.evaluateJavascript("addNewTransaction('$json')", null)
                        }
                    } catch (e: Exception) {
                        e.printStackTrace()
                    }
                }
            }
        }
    }

    @JavascriptInterface
    fun getSmsTransactions(): String {
        readSmsMessages()

        val jsonArray = JSONArray()
        val sortedMessages = smsMap.values.sortedByDescending { it.date }

        for (sms in sortedMessages) {
            try {
                val amount = sms.parseAmount()
                if (amount != null && amount > 0) {
                    val jsonObject = JSONObject().apply {
                        put("id", sms.id)
                        put("merchant", sms.parseMerchant())
                        put("date", sms.getFormattedDate())
                        put("category", sms.getCategory())
                        put("status", sms.getStatus())
                        put("type", sms.getTransactionType())
                        put("amount", amount)

                        // Add Union Bank specific fields if applicable
                        if (sms.isUnionBankMessage()) {
                            put("balance", sms.parseBalance() ?: 0.0)
                            put("refNumber", sms.parseReferenceNumber())
                            put("txnDate", sms.parseTransactionDate())
                            put("messageType", "UNION_BANK")
                        } else if (sms.isRechargeMessage()) {
                            put("messageType", "RECHARGE")
                        }
                    }
                    jsonArray.put(jsonObject)
                }
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }

        return jsonArray.toString()
    }

    private fun readSmsMessages() {
        val newMap = LinkedHashMap<Long, BankSmsMessage>()

        val cursor = contentResolver.query(
            Telephony.Sms.Inbox.CONTENT_URI,
            arrayOf(
                Telephony.Sms._ID,
                Telephony.Sms.ADDRESS,
                Telephony.Sms.BODY,
                Telephony.Sms.DATE,
                Telephony.Sms.TYPE
            ),
            null,
            null,
            "${Telephony.Sms.DATE} DESC"
        )

        cursor?.use {
            val idCol = it.getColumnIndexOrThrow(Telephony.Sms._ID)
            val addressCol = it.getColumnIndexOrThrow(Telephony.Sms.ADDRESS)
            val bodyCol = it.getColumnIndexOrThrow(Telephony.Sms.BODY)
            val dateCol = it.getColumnIndexOrThrow(Telephony.Sms.DATE)
            val typeCol = it.getColumnIndexOrThrow(Telephony.Sms.TYPE)

            while (it.moveToNext()) {
                try {
                    val sms = BankSmsMessage(
                        id = it.getLong(idCol),
                        address = it.getString(addressCol) ?: "Unknown",
                        body = it.getString(bodyCol) ?: "",
                        date = it.getLong(dateCol),
                        type = it.getInt(typeCol)
                    )

                    // FIXED: Use isRelevantMessage() instead of isBankTransaction()
                    if (sms.isRelevantMessage() && sms.parseAmount() != null) {
                        newMap[sms.id] = sms
                    }
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        smsMap.clear()
        smsMap.putAll(newMap)
    }

    @JavascriptInterface
    fun refreshTransactions(): String {
        readSmsMessages()
        return "refreshed"
    }

    fun cleanup() {
        try {
            localBroadcastManager.unregisterReceiver(smsBroadcastReceiver)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }
}