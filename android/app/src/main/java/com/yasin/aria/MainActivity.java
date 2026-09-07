package com.yasin.aria;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.Build;
import android.os.Bundle;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;
import java.util.concurrent.Executor;

public class MainActivity extends Activity {
    private WebView web;
    private static final String URL = "https://aria-v4-production.up.railway.app/";
    private static final String WAKE_ACTION = "com.yasin.aria.WAKE";
    private final BroadcastReceiver wakeReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            deliverWake(intent.getStringExtra("text"));
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestRuntimePermissions();
        setupWebView();
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(wakeReceiver, new IntentFilter(WAKE_ACTION), Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(wakeReceiver, new IntentFilter(WAKE_ACTION));
        startVoiceService();
        if (Build.VERSION.SDK_INT >= 28) authenticateBiometric();
        handleWakeIntent(getIntent());
    }

    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 10);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 11);
    }

    private void setupWebView() {
        web = new WebView(this);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(final PermissionRequest r){ runOnUiThread(() -> r.grant(r.getResources())); }
        });
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setBuiltInZoomControls(false);
        web.loadUrl(URL);
        setContentView(web);
    }

    private void startVoiceService() {
        if (Build.VERSION.SDK_INT >= 26) startForegroundService(new Intent(this, AriaVoiceService.class));
        else startService(new Intent(this, AriaVoiceService.class));
    }

    private void authenticateBiometric() {
        try {
            BiometricPrompt prompt = new BiometricPrompt.Builder(this)
                    .setTitle("ورود به ARIA")
                    .setSubtitle("برای دسترسی به دستیار، هویت خود را تأیید کنید")
                    .setDescription("اثر انگشت یا روش بیومتریک دستگاه")
                    .setNegativeButton("بعداً", getMainExecutor(), (dialog, which) -> {})
                    .build();
            Executor executor = getMainExecutor();
            prompt.authenticate(new android.os.CancellationSignal(), executor, new BiometricPrompt.AuthenticationCallback() {
                @Override public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult result) {
                    deliverWake("ARIA آماده است");
                }
            });
        } catch (Exception ignored) {}
    }

    private void handleWakeIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("wake", false)) deliverWake(intent.getStringExtra("wake_text"));
    }

    private void deliverWake(String text) {
        if (web == null) return;
        try {
            String safe = JSONObject.quote(text == null ? "سلام آریا" : text);
            web.post(() -> web.evaluateJavascript("window.dispatchEvent(new CustomEvent('ariaWake',{detail:{text:" + safe + "}}));", null));
        } catch (Exception ignored) {}
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWakeIntent(intent);
    }

    @Override protected void onDestroy() {
        try { unregisterReceiver(wakeReceiver); } catch (Exception ignored) {}
        super.onDestroy();
    }

    @Override public void onBackPressed(){ if(web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
