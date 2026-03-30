package com.example.banksmsreader

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.provider.Telephony
import android.util.Log

class SmsReceiver : BroadcastReceiver() {

    companion object {
        private const val TAG = "SmsReceiver"
    }

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action == Telephony.Sms.Intents.SMS_RECEIVED_ACTION) {
            val bundle: Bundle? = intent.extras
            if (bundle != null) {
                val pdus = bundle.get("pdus") as Array<*>?
                pdus?.let {
                    val messages = arrayOfNulls<android.telephony.SmsMessage>(it.size)

                    for (i in it.indices) {
                        messages[i] = Telephony.Sms.Intents.getMessagesFromIntent(intent)[i]
                    }

                    for (sms in messages) {
                        sms?.let { message ->
                            val sender = message.displayOriginatingAddress
                            val body = message.displayMessageBody
                            val timestamp = message.timestampMillis

                            Log.d(TAG, "SMS Received - From: $sender, Body: $body")

                            if (isBankTransaction(sender, body)) {
                                // FIXED: Use BankSmsMessage instead of SmsMessage
                                val smsMessage = BankSmsMessage(
                                    id = System.currentTimeMillis(),
                                    address = sender,
                                    body = body,
                                    date = timestamp,
                                    type = 1
                                )

                                val updateIntent = Intent("NEW_SMS_RECEIVED")
                                updateIntent.putExtra("sms_id", smsMessage.id)
                                updateIntent.putExtra("sender", sender)
                                updateIntent.putExtra("body", body)
                                updateIntent.putExtra("timestamp", timestamp)
                                updateIntent.putExtra("amount", smsMessage.parseAmount() ?: 0.0)
                                updateIntent.putExtra("type", smsMessage.getTransactionType())
                                updateIntent.putExtra("merchant", smsMessage.parseMerchant())
                                updateIntent.putExtra("category", smsMessage.getCategory())
                                context.sendBroadcast(updateIntent)

                                Log.d(TAG, "Bank transaction detected: $sender - ${smsMessage.parseAmount()}")
                            }
                        }
                    }
                }
            }
        }
    }

    private fun isBankTransaction(sender: String, body: String): Boolean {
        // ROOT CAUSE FIX: replaced exact "available balance" string with a regex
        // covering all real Indian bank SMS balance abbreviations.
        val hasBalance = Regex(
            """avl\.?\s*bal|avail(?:able)?\s*bal(?:ance)?|a/?c\s*bal|ac\s*bal|\bbal(?:ance)?\s*[:\s]\s*(?:rs|inr|₹)""",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(body)
        if (!hasBalance) return false

        val bankKeywords = listOf(
            "bank", "hdfc", "icici", "sbi", "axis", "kotak", "yesbank", "pnb",
            "canara", "idbi", "indusind", "union", "bob", "boi", "hsbc", "citi"
        )

        val transactionKeywords = listOf(
            "debited", "credited", "spent", "paid", "purchase", "transaction",
            "withdrawn", "deposited", "account", "balance", "atm", "card",
            "upi", "imps", "neft", "rtgs", "trf", "transfer", "txn",
            "payment", "sent", "received", "refund"
        )

        val senderLower = sender.lowercase()
        val bodyLower = body.lowercase()

        val isFromBank = bankKeywords.any { senderLower.contains(it) }
        val hasTransactionKeyword = transactionKeywords.any { bodyLower.contains(it) }
        val hasAmount = Regex("(rs|inr|₹)\\s*\\d+", RegexOption.IGNORE_CASE).containsMatchIn(body) ||
                Regex("\\d+\\s*(rs|inr)", RegexOption.IGNORE_CASE).containsMatchIn(body) ||
                Regex("amt\\s*\\d+", RegexOption.IGNORE_CASE).containsMatchIn(body)

        return (isFromBank || hasTransactionKeyword) && hasAmount
    }
}