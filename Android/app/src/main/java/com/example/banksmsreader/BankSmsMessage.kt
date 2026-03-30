package com.example.banksmsreader

import java.text.SimpleDateFormat
import java.util.*

data class BankSmsMessage(
    val id: Long,
    val address: String,
    val body: String,
    val date: Long,
    val type: Int
) {

    // Union Bank specific sender IDs (ONLY Union Bank)
    private val unionBankSenders = setOf(
        "UNIONBK", "UNIONBANK", "UBI", "UNION", "CORPBANK",
        "UNIONB", "UBIN", "CORP"
    )

    // Telecom sender IDs for recharge messages (ONLY Recharge)
    private val telecomSenders = setOf(
        "AIRTEL", "JIO", "VI", "IDEA", "VODAFONE", "BSNL", "TATA",
        "AIRTELPY", "JIOPAY", "VIIN", "MYJIO", "AIRPAY"
    )

    // Union Bank specific pattern - MADE MORE FLEXIBLE
    private val unionBankPattern = Regex(
        """AC\s+\S+\s+for\s+Rs\.?\s*([\d,]+\.?\d*)\s+on\s+(\d{2}[-/]\d{2}[-/]\d{2,4})\s+(\d{2}:\d{2}),\s+mobile\s+ref\s+no\s+(\S+),\s+Avl\s+Bal\s+Rs\.?\s*([\d,]+\.?\d*)""",
        RegexOption.IGNORE_CASE
    )

    // Fallback pattern for Union Bank (if exact pattern doesn't match)
    private val unionBankFallbackPattern = Regex(
        """UNION.*?(?:Rs\.?|INR|₹)\s*([\d,]+\.?\d*).*?(?:Avl|Available|Bal)""",
        RegexOption.IGNORE_CASE
    )

    // Recharge/Top-up keywords
    private val rechargeKeywords = setOf(
        "recharge", "top[ -]up", "plan", "validity", "data pack",
        "talktime", "subscription", "activated", "purchased",
        "balance", "expires on", "valid till"
    )

    // Spam patterns (minimal filtering)
    private val spamPatterns = listOf(
        "\\botp\\b".toRegex(RegexOption.IGNORE_CASE),
        "www\\.|http".toRegex(RegexOption.IGNORE_CASE)
    )

    // Main function to check if message should be included
    // THIS REPLACES isBankTransaction()
    fun isRelevantMessage(): Boolean {
        // Quick spam check
        if (isSpamMessage()) return false

        // Check if it's a Union Bank message
        if (isUnionBankMessage()) return true

        // Check if it's a Recharge message
        if (isRechargeMessage()) return true

        // If neither, exclude it
        return false
    }

    // For backward compatibility with your existing code
    fun isBankTransaction(): Boolean {
        return isRelevantMessage()
    }

    // Check if message is from Union Bank
    fun isUnionBankMessage(): Boolean {
        // Check if sender is Union Bank
        val isFromUnionBank = unionBankSenders.any {
            address.uppercase().contains(it)
        }

        // If not from Union Bank, reject
        if (!isFromUnionBank) return false

        // Try exact pattern match
        if (unionBankPattern.containsMatchIn(body)) return true

        // Try fallback pattern
        if (unionBankFallbackPattern.containsMatchIn(body)) return true

        // If it has amount and is from Union Bank, consider it
        val hasAmount = parseAmount() != null
        val hasTransactionWord = body.lowercase().contains(Regex("debited|credited|paid|purchase|transaction|txn|for"))

        return hasAmount && hasTransactionWord
    }

    // Check if message is a recharge message
    fun isRechargeMessage(): Boolean {
        val addressUpper = address.uppercase()
        val bodyLower = body.lowercase()

        // Check if from telecom sender
        val isFromTelecom = telecomSenders.any { addressUpper.contains(it) }

        // Check for recharge keywords
        val hasRechargeKeyword = rechargeKeywords.any {
            Regex(it, RegexOption.IGNORE_CASE).containsMatchIn(bodyLower)
        }

        // Check for recharge-specific patterns
        val rechargePatterns = listOf(
            "recharge of (?:rs|inr|₹)?\\s*\\d+",
            "top[ -]up of (?:rs|inr|₹)?\\s*\\d+",
            "plan (?:activated|purchased|recharged|bought)",
            "validity (?:till|upto|until)",
            "data balance.*\\d+\\.?\\d*\\s*(?:gb|mb)",
            "talktime balance.*\\d+"
        ).map { it.toRegex(RegexOption.IGNORE_CASE) }

        val matchesRechargePattern = rechargePatterns.any { it.containsMatchIn(bodyLower) }

        // Check for amount
        val hasAmount = parseAmount() != null

        return (isFromTelecom || hasRechargeKeyword || matchesRechargePattern) && hasAmount
    }

    // Spam check
    private fun isSpamMessage(): Boolean {
        val bodyLower = body.lowercase()

        if (spamPatterns.any { it.containsMatchIn(body) }) return true
        if (body.length < 20) return true
        if (body.contains(Regex("https?://|www\\.", RegexOption.IGNORE_CASE))) return true

        return false
    }

    // Parse amount from message
    fun parseAmount(): Double? {
        // First try Union Bank pattern
        val unionMatch = unionBankPattern.find(body)
        if (unionMatch != null) {
            val amountStr = unionMatch.groupValues[1].replace(",", "").trim()
            return amountStr.toDoubleOrNull()
        }

        // For recharge messages, use amount patterns
        val amountPatterns = listOf(
            "(?:rs\\.?|inr|₹)\\s*([\\d,]+(?:\\.\\d{1,2})?)".toRegex(RegexOption.IGNORE_CASE),
            "([\\d,]+(?:\\.\\d{1,2})?)\\s*(?:rs|inr)".toRegex(RegexOption.IGNORE_CASE),
            "(?:recharge|top[ -]up|plan|paid|debited|credited)\\s+(?:of|for|by)?\\s*(?:rs\\.?|inr|₹)?\\s*([\\d,]+(?:\\.\\d{1,2})?)".toRegex(RegexOption.IGNORE_CASE)
        )

        for (pattern in amountPatterns) {
            pattern.find(body)?.let { match ->
                val amountStr = match.groupValues[1].replace(",", "").trim()
                val amount = amountStr.toDoubleOrNull()
                if (amount != null && amount in 1.0..1_000_000.0) {
                    return amount
                }
            }
        }

        return null
    }

    // Parse balance (only for Union Bank messages)
    fun parseBalance(): Double? {
        val match = unionBankPattern.find(body)
        return match?.let {
            val balanceStr = it.groupValues[5].replace(",", "").trim()
            balanceStr.toDoubleOrNull()
        }
    }

    // Parse reference number (only for Union Bank messages)
    fun parseReferenceNumber(): String {
        val match = unionBankPattern.find(body)
        return match?.groupValues[4]?.trim() ?: "N/A"
    }

    // Parse transaction date from Union Bank pattern
    fun parseTransactionDate(): String {
        val match = unionBankPattern.find(body)
        return match?.let {
            val dateStr = it.groupValues[2]
            val timeStr = it.groupValues[3]
            "$dateStr $timeStr"
        } ?: "Unknown"
    }

    // Parse merchant/operator
    fun parseMerchant(): String {
        // For Union Bank messages
        if (isUnionBankMessage()) {
            return "Union Bank"
        }

        // For recharge messages
        if (isRechargeMessage()) {
            return when {
                address.uppercase().contains("AIR") -> "Airtel"
                address.uppercase().contains("JIO") -> "Jio"
                address.uppercase().contains("VI") || address.uppercase().contains("VODA") -> "Vi"
                address.uppercase().contains("IDEA") -> "Idea"
                address.uppercase().contains("BSNL") -> "BSNL"
                else -> "Mobile Recharge"
            }
        }

        return "Unknown"
    }

    // Get transaction type
    fun getTransactionType(): String {
        val bodyLower = body.lowercase()

        // Credit indicators
        if (bodyLower.contains(Regex("credited|received|deposited|refund|cashback|interest"))) {
            return "credit"
        }

        // Debit indicators (including Union Bank and recharge)
        if (bodyLower.contains(Regex("debited|spent|paid|withdrawn|purchase|payment"))) {
            return "debit"
        }

        // Union Bank messages are typically debits
        if (isUnionBankMessage()) {
            return "debit"
        }

        // Recharge messages are always debits
        if (isRechargeMessage()) {
            return "debit"
        }

        return "debit"
    }

    // Get category
    fun getCategory(): String {
        // Recharge messages
        if (isRechargeMessage()) {
            return "Mobile Recharge"
        }

        // Union Bank messages
        if (isUnionBankMessage()) {
            val bodyLower = body.lowercase()
            return when {
                bodyLower.contains(Regex("swiggy|zomato|restaurant|cafe|food|dining")) -> "Food & Dining"
                bodyLower.contains(Regex("uber|ola|petrol|fuel|transport|metro|taxi|cab")) -> "Travel & Transport"
                bodyLower.contains(Regex("amazon|flipkart|shopping|order|purchase|myntra")) -> "Shopping"
                bodyLower.contains(Regex("netflix|prime|hotstar|youtube|entertainment|spotify")) -> "Entertainment"
                bodyLower.contains(Regex("bill|recharge|electricity|mobile|broadband|internet|dth")) -> "Utilities"
                bodyLower.contains(Regex("hospital|medical|pharmacy|medicine|health|clinic")) -> "Healthcare"
                bodyLower.contains(Regex("school|college|university|tuition|fees|education")) -> "Education"
                else -> "Others"
            }
        }

        return "Others"
    }

    // Get status
    fun getStatus(): String {
        val bodyLower = body.lowercase()
        return when {
            bodyLower.contains(Regex("pending|processing|initiated", RegexOption.IGNORE_CASE)) -> "pending"
            bodyLower.contains(Regex("failed|declined|rejected|unsuccessful|cancelled", RegexOption.IGNORE_CASE)) -> "flagged"
            else -> "completed"
        }
    }

    // Get formatted date
    fun getFormattedDate(): String {
        return try {
            val sdf = SimpleDateFormat("dd MMM yyyy, hh:mm a", Locale.getDefault())
            sdf.format(Date(date))
        } catch (e: Exception) {
            Date(date).toString()
        }
    }

    // Get summary based on message type
    fun getSummary(): String {
        return when {
            isUnionBankMessage() -> {
                val amount = parseAmount()?.let { "₹%.2f".format(it) } ?: "Unknown"
                val balance = parseBalance()?.let { "₹%.2f".format(it) } ?: "Unknown"
                val refNo = parseReferenceNumber()
                val txnDate = parseTransactionDate()
                val category = getCategory()

                """
                ┌─────────────────────────┐
                │   UNION BANK TRANSACTION │
                ├─────────────────────────┤
                │ Amount : ₹${amount}
                │ Date   : $txnDate
                │ Ref No : $refNo
                │ Balance: ₹${balance}
                │ Category: $category
                └─────────────────────────┘
                """.trimIndent()
            }

            isRechargeMessage() -> {
                val amount = parseAmount()?.let { "₹%.2f".format(it) } ?: "Unknown"
                val operator = parseMerchant()

                """
                ┌─────────────────────────┐
                │   MOBILE RECHARGE        │
                ├─────────────────────────┤
                │ Operator: $operator
                │ Amount  : ₹${amount}
                └─────────────────────────┘
                """.trimIndent()
            }

            else -> "Unknown message type"
        }
    }

    // Quick validation for Union Bank messages
    fun isValidUnionBankMessage(): Boolean {
        return isUnionBankMessage() && parseAmount() != null
    }
}

// Extension function for filtering relevant messages
fun List<BankSmsMessage>.filterRelevantMessages(): List<BankSmsMessage> {
    return this.filter { it.isRelevantMessage() }
}

// Extension function for Union Bank messages only
fun List<BankSmsMessage>.filterUnionBankMessages(): List<BankSmsMessage> {
    return this.filter { it.isUnionBankMessage() }
}

// Extension function for Recharge messages only
fun List<BankSmsMessage>.filterRechargeMessages(): List<BankSmsMessage> {
    return this.filter { it.isRechargeMessage() }
}