package com.aria
import android.Manifest
import android.os.Bundle
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.result.contract.ActivityResultContracts
class MainActivity: ComponentActivity(){
 private val mic=registerForActivityResult(ActivityResultContracts.RequestPermission()){}
 override fun onCreate(b:Bundle?){super.onCreate(b);mic.launch(Manifest.permission.RECORD_AUDIO);val w=WebView(this);w.settings.javaScriptEnabled=true;w.settings.domStorageEnabled=true;w.webViewClient=WebViewClient();w.loadUrl("file:///android_asset/index.html");setContentView(w)}
}
