package com.aria.ai

import android.annotation.SuppressLint
import android.app.Activity
import android.os.Bundle
import android.webkit.*

class MainActivity : Activity() {
 private lateinit var web: WebView
 @SuppressLint("SetJavaScriptEnabled")
 override fun onCreate(savedInstanceState: Bundle?) {
  super.onCreate(savedInstanceState)
  web = WebView(this)
  web.settings.javaScriptEnabled = true
  web.settings.domStorageEnabled = true
  web.settings.allowFileAccess = true
  web.settings.mediaPlaybackRequiresUserGesture = false
  web.settings.cacheMode = WebSettings.LOAD_DEFAULT
  web.webViewClient = WebViewClient()
  web.webChromeClient = WebChromeClient()
  web.loadUrl("file:///android_asset/index.html")
  setContentView(web)
 }
 override fun onBackPressed() { if (web.canGoBack()) web.goBack() else super.onBackPressed() }
}
