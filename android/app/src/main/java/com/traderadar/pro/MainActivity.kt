package com.traderadar.pro

import android.app.Activity
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.content.Intent
import android.net.Uri
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Button

/** Initial Android test shell. Native notification integration and store compliance remain pending. */
class MainActivity : Activity() {
    private lateinit var browser: WebView
    private val host = "traderadar-v3-production.up.railway.app"
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val layout = LinearLayout(this).apply { orientation = LinearLayout.VERTICAL }
        val bar = LinearLayout(this).apply { orientation = LinearLayout.HORIZONTAL }
        val title = TextView(this).apply { text = "TradeRadar Pro"; textSize = 18f; setPadding(16,16,16,16) }
        val reload = Button(this).apply { text = "Yenile"; setOnClickListener { browser.reload() } }
        bar.addView(title, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f))
        bar.addView(reload)
        layout.addView(bar)
        browser = WebView(this)
        browser.settings.javaScriptEnabled = true
        browser.settings.domStorageEnabled = true
        browser.settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
        browser.settings.cacheMode = WebSettings.LOAD_DEFAULT
        browser.settings.allowFileAccess = false
        browser.settings.allowContentAccess = false
        browser.webChromeClient = WebChromeClient()
        browser.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url
                if (uri.scheme == "https" && uri.host == host) return false
                if (uri.scheme == "https" || uri.scheme == "mailto") {
                    startActivity(Intent(Intent.ACTION_VIEW, uri)); return true
                }
                return true
            }
        }
        layout.addView(browser, LinearLayout.LayoutParams(-1,0,1f))
        setContentView(layout)
        if (savedInstanceState == null) browser.loadUrl("https://$host/") else browser.restoreState(savedInstanceState)
    }
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() { if (browser.canGoBack()) browser.goBack() else super.onBackPressed() }
    override fun onSaveInstanceState(outState: Bundle) { browser.saveState(outState); super.onSaveInstanceState(outState) }
    override fun onDestroy() { browser.destroy(); super.onDestroy() }
}
