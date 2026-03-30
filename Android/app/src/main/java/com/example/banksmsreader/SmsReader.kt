package com.example.banksmsreader

import android.content.Context
import android.provider.Telephony

object SmsReader {

    fun getBankMessages(context: Context): List<BankSmsMessage> {

        val messages = mutableListOf<BankSmsMessage>()

        val cursor = context.contentResolver.query(
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
            "date DESC"
        )

        cursor?.use {

            val idIndex     = it.getColumnIndex(Telephony.Sms._ID)
            val bodyIndex   = it.getColumnIndex(Telephony.Sms.BODY)
            val senderIndex = it.getColumnIndex(Telephony.Sms.ADDRESS)
            val dateIndex   = it.getColumnIndex(Telephony.Sms.DATE)
            val typeIndex   = it.getColumnIndex(Telephony.Sms.TYPE)

            if (bodyIndex == -1 || senderIndex == -1 || dateIndex == -1) return emptyList()

            while (it.moveToNext()) {

                val id     = if (idIndex != -1) it.getLong(idIndex) else System.currentTimeMillis()
                val body   = it.getString(bodyIndex) ?: ""
                val sender = it.getString(senderIndex) ?: ""
                val date   = it.getLong(dateIndex)
                val type   = if (typeIndex != -1) it.getInt(typeIndex) else 1

                if (isBankMessage(body, sender)) {
                    // FIXED: All 5 named parameters now passed correctly
                    messages.add(
                        BankSmsMessage(
                            id      = id,
                            address = sender,
                            body    = body,
                            date    = date,
                            type    = type
                        )
                    )
                }
            }
        }

        return messages
    }

    private fun isBankMessage(body: String, sender: String): Boolean {
        // ROOT CAUSE FIX: replaced exact "available balance" string check with a
        // regex covering all real Indian bank SMS balance abbreviations:
        // "Avl Bal", "Avbl Bal", "Available Bal", "A/C Bal", "Bal:", "Balance:" etc.
        val hasBalance = Regex(
            """avl\.?\s*bal|avail(?:able)?\s*bal(?:ance)?|a/?c\s*bal|ac\s*bal|\bbal(?:ance)?\s*[:\s]\s*(?:rs|inr|₹)""",
            RegexOption.IGNORE_CASE
        ).containsMatchIn(body)
        if (!hasBalance) return false

        return body.contains("debited", true) ||
                body.contains("credited", true) ||
                body.contains("txn", true) ||
                sender.contains("bank", true)
    }
}