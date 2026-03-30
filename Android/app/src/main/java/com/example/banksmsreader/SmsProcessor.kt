package com.example.banksmsreader;
import android.util.Log;


object SmsProcessor {

    fun processSms(sender: String, message: String) {

        try {

            // Example: Detect Bank SMS
            if (sender.contains("BANK", ignoreCase = true)) {

                val amount = extractAmount(message)
                val transactionType = detectTransactionType(message)

                Log.d("BANK_SMS", "Type: $transactionType Amount: $amount")

                // Save to database or send to server
            }

        } catch (e: Exception) {
            Log.e("PROCESS_ERROR", "Processing failed: ${e.message}")
        }
    }

    private fun extractAmount(message: String): String {

        val regex = Regex("(Rs\\.?\\s?\\d+[,.]?\\d*)")
        val match = regex.find(message)
        return match?.value ?: "0"
    }

    private fun detectTransactionType(message: String): String {

        return when {
            message.contains("credited", true) -> "CREDIT"
            message.contains("debited", true) -> "DEBIT"
            else -> "UNKNOWN"
        }
    }
}