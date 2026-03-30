package com.example.banksmsreader

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity
import androidx.core.app.ActivityCompat
import androidx.core.content.ContextCompat

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView
    private lateinit var smsWebInterface: SmsWebInterface

    companion object {
        private const val SMS_PERMISSION_CODE = 101
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)
        setupWebView()
        checkAndRequestSmsPermission()
    }

    private fun setupWebView() {
        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.allowFileAccess = true
        settings.allowContentAccess = true
        settings.loadWithOverviewMode = true
        settings.useWideViewPort = true

        // Enable cache using modern approach
        settings.cacheMode = WebSettings.LOAD_DEFAULT
//        settings.setAppCacheEnabled(false) // Remove this line as it's deprecated

        // For newer Android versions
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.safeBrowsingEnabled = true
        }

        smsWebInterface = SmsWebInterface(this, contentResolver)
        smsWebInterface.setWebView(webView)

        webView.addJavascriptInterface(smsWebInterface, "AndroidSmsInterface")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView, url: String) {
                super.onPageFinished(view, url)
                // Load transactions after page is fully loaded
                view.postDelayed({
                    view.evaluateJavascript("loadSmsTransactions()", null)
                }, 500)
            }
        }

        webView.loadUrl("file:///android_asset/index.html")
    }

    private fun checkAndRequestSmsPermission() {
        val readSms = ContextCompat.checkSelfPermission(this, Manifest.permission.READ_SMS)

        if (readSms != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(
                this,
                arrayOf(Manifest.permission.READ_SMS),
                SMS_PERMISSION_CODE
            )
        }
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == SMS_PERMISSION_CODE) {
            if (grantResults.isNotEmpty() && grantResults[0] == PackageManager.PERMISSION_GRANTED) {
                webView.evaluateJavascript("refreshTransactionsFromSms()", null)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        if (::webView.isInitialized) {
            webView.evaluateJavascript("refreshTransactionsFromSms()", null)
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        smsWebInterface.cleanup()
        webView.destroy()
    }
}