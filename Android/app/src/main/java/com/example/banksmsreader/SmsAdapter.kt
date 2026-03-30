package com.example.banksmsreader

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

// FIXED: Use BankSmsMessage instead of SmsMessage
class SmsAdapter(private var smsList: List<BankSmsMessage>) :
    RecyclerView.Adapter<SmsAdapter.SmsViewHolder>() {

    class SmsViewHolder(itemView: View) : RecyclerView.ViewHolder(itemView) {
        val senderTextView: TextView = itemView.findViewById(R.id.tvSender)
        val bodyTextView: TextView = itemView.findViewById(R.id.tvBody)
        val dateTextView: TextView = itemView.findViewById(R.id.tvDate)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): SmsViewHolder {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_sms, parent, false)
        return SmsViewHolder(view)
    }

    override fun onBindViewHolder(holder: SmsViewHolder, position: Int) {
        val sms = smsList[position]
        holder.senderTextView.text = sms.address
        holder.bodyTextView.text = sms.body
        // FIXED: Convert Long timestamp to readable date
        val sdf = SimpleDateFormat("dd MMM yyyy, HH:mm", Locale.getDefault())
        holder.dateTextView.text = sdf.format(Date(sms.date))
    }

    override fun getItemCount(): Int = smsList.size

    fun updateData(newList: List<BankSmsMessage>) {
        smsList = newList
        notifyDataSetChanged()
    }
}