package com.traderadar.pro

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.TextView

/**
 * Installable Android app shell. Uses the existing TradeRadar server for live signals.
 * No exchange order placement, native background scan, or native push delivery is implied.
 */
class MainActivity : Activity() {
    private val host = "traderadar-v3-production.up.railway.app"
    private val homeUrl = "https://$host/"
    private lateinit var browser: WebView
    private lateinit var offlinePanel: LinearLayout
    private lateinit var progress: ProgressBar
    private var mainFrameFailed = false

    private fun dp(value: Int): Int = (value * resources.displayMetrics.density + 0.5f).toInt()

    private fun openExternal(uri: Uri) {
        try {
            startActivity(Intent(Intent.ACTION_VIEW, uri))
        } catch (_: ActivityNotFoundException) {
            // No compatible external application installed.
        } catch (_: SecurityException) {
            // The OS declined to open the destination.
        }
    }

    private fun retry() {
        mainFrameFailed = false
        offlinePanel.visibility = View.GONE
        browser.loadUrl(homeUrl)
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        window.statusBarColor = Color.rgb(7, 16, 31)
        window.navigationBarColor = Color.rgb(7, 16, 31)
        val root = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.rgb(7, 16, 31))
        }
        val header = LinearLayout(this).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(13), dp(6), dp(13), dp(6))
            setBackgroundColor(Color.rgb(14, 25, 43))
        }
        val logo = ImageView(this).apply {
            setImageResource(R.drawable.ic_traderadar)
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        header.addView(logo, LinearLayout.LayoutParams(dp(40), dp(40)))
        val titleColumn = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            setPadding(dp(7), 0, 0, 0)
        }
        titleColumn.addView(TextView(this).apply {
            text = "TradeRadar"
            setTextColor(Color.WHITE)
            textSize = 17f
            setTypeface(null, android.graphics.Typeface.BOLD)
        })
        titleColumn.addView(TextView(this).apply {
            text = "Teknik yükseliş tarama sistemi"
            setTextColor(Color.rgb(157, 178, 203))
            textSize = 10f
        })
        header.addView(titleColumn, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        val reload = Button(this).apply {
            text = "Yenile"
            textSize = 12f
            isAllCaps = false
            setOnClickListener { retry() }
        }
        header.addView(reload, LinearLayout.LayoutParams(dp(88), dp(44)))
        root.addView(header, LinearLayout.LayoutParams(-1, dp(57)))
        progress = ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal).apply {
            max = 100
            progressTintList = android.content.res.ColorStateList.valueOf(Color.rgb(34, 202, 174))
            progressBackgroundTintList = android.content.res.ColorStateList.valueOf(Color.rgb(18, 46, 69))
            visibility = View.GONE
        }
        root.addView(progress, LinearLayout.LayoutParams(-1, dp(3)))
        val area = FrameLayout(this)
        browser = WebView(this).apply {
            setBackgroundColor(Color.rgb(7, 16, 31))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            settings.cacheMode = WebSettings.LOAD_DEFAULT
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportMultipleWindows(false)
            settings.setSupportZoom(false)
            webChromeClient = object : WebChromeClient() {
                override fun onProgressChanged(view: WebView?, newProgress: Int) {
                    this@MainActivity.progress.progress = newProgress
                    this@MainActivity.progress.visibility = if (newProgress >= 100) View.GONE else View.VISIBLE
                }
            }
            webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest): Boolean {
                    val uri = request.url
                    if (uri.scheme == "https" && uri.host == host) return false
                    if (uri.scheme == "https" || uri.scheme == "http" || uri.scheme == "mailto" || uri.scheme == "tel") {
                        openExternal(uri)
                    }
                    return true
                }
                override fun onPageStarted(view: WebView?, url: String?, favicon: android.graphics.Bitmap?) {
                    mainFrameFailed = false
                }
                override fun onReceivedError(view: WebView?, request: WebResourceRequest?, error: WebResourceError?) {
                    if (request?.isForMainFrame == true) {
                        mainFrameFailed = true
                        offlinePanel.visibility = View.VISIBLE
                    }
                }
                override fun onPageFinished(view: WebView?, url: String?) {
                    if (!mainFrameFailed) offlinePanel.visibility = View.GONE
                }
            }
            setDownloadListener { url, _, _, _, _ ->
                val uri = runCatching { Uri.parse(url) }.getOrNull()
                if (uri != null && (uri.scheme == "https" || uri.scheme == "http")) openExternal(uri)
            }
        }
        area.addView(browser, FrameLayout.LayoutParams(-1, -1))
        offlinePanel = LinearLayout(this).apply {
            orientation = LinearLayout.VERTICAL
            gravity = Gravity.CENTER
            setPadding(dp(28), dp(30), dp(28), dp(30))
            setBackgroundColor(Color.rgb(7, 16, 31))
            visibility = View.GONE
        }
        offlinePanel.addView(TextView(this).apply {
            text = "Bağlantı kurulamadı"
            textSize = 23f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
        })
        offlinePanel.addView(TextView(this).apply {
            text = "Canlı piyasa taraması için internet bağlantısı gereklidir. Bağlantıyı kontrol edip tekrar deneyin."
            textSize = 14f
            setTextColor(Color.rgb(158, 179, 205))
            gravity = Gravity.CENTER
            setPadding(0, dp(12), 0, dp(18))
        })
        offlinePanel.addView(Button(this).apply {
            text = "Yeniden dene"
            isAllCaps = false
            setOnClickListener { retry() }
        })
        area.addView(offlinePanel, FrameLayout.LayoutParams(-1, -1))
        root.addView(area, LinearLayout.LayoutParams(-1, 0, 1f))
        setContentView(root)
        if (savedInstanceState == null) browser.loadUrl(homeUrl)
        else if (browser.restoreState(savedInstanceState) == null) browser.loadUrl(homeUrl)
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        if (::browser.isInitialized && browser.canGoBack()) browser.goBack()
        else super.onBackPressed()
    }

    override fun onSaveInstanceState(outState: Bundle) {
        if (::browser.isInitialized) browser.saveState(outState)
        super.onSaveInstanceState(outState)
    }

    override fun onDestroy() {
        if (::browser.isInitialized) {
            (browser.parent as? ViewGroup)?.removeView(browser)
            browser.destroy()
        }
        super.onDestroy()
    }
}
