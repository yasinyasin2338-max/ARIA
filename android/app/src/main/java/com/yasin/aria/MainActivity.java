package com.yasin.aria;

import android.Manifest;
import android.app.Activity;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.hardware.biometrics.BiometricPrompt;

import org.json.JSONObject;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executor;

public class MainActivity extends Activity {
    private WebView web;
    private TextToSpeech tts;
    private static final String URL = "https://aria-v4-production.up.railway.app/";
    private static final String WAKE_ACTION = "com.yasin.aria.WAKE";

    private final BroadcastReceiver wakeReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            showWake(intent.getStringExtra("text"));
        }
    };

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        requestRuntimePermissions();
        initTts();
        setupWebView();
        if (Build.VERSION.SDK_INT >= 33) registerReceiver(wakeReceiver, new IntentFilter(WAKE_ACTION), Context.RECEIVER_NOT_EXPORTED);
        else registerReceiver(wakeReceiver, new IntentFilter(WAKE_ACTION));
        startVoiceServiceIfAllowed();
        if (Build.VERSION.SDK_INT >= 28) authenticateBiometric();
        handleWakeIntent(getIntent());
    }

    private void requestRuntimePermissions() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO}, 10);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED)
            requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 11);
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == 10 && grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED) startVoiceServiceIfAllowed();
    }

    private void initTts() {
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || tts == null) return;
            try {
                tts.setLanguage(new Locale("fa", "IR"));
                tts.setSpeechRate(1.02f);
                tts.setPitch(1.08f);
                if (Build.VERSION.SDK_INT >= 21) {
                    Set<Voice> voices = tts.getVoices();
                    if (voices != null) {
                        Voice best = null;
                        for (Voice v : voices) {
                            String n = String.valueOf(v.getName()).toLowerCase(Locale.ROOT);
                            Locale l = v.getLocale();
                            if (l != null && l.getLanguage().equals("fa")) {
                                if (n.contains("female") || n.contains("woman") || n.contains("girl") || n.contains("sara") || n.contains("zira")) { best = v; break; }
                                if (best == null) best = v;
                            }
                        }
                        if (best != null) tts.setVoice(best);
                    }
                }
            } catch (Exception ignored) {}
        });
    }

    private void setupWebView() {
        web = new WebView(this);
        web.setWebViewClient(new WebViewClient());
        web.setWebChromeClient(new WebChromeClient(){
            @Override public void onPermissionRequest(final PermissionRequest r){ runOnUiThread(() -> r.grant(r.getResources())); }
        });
        web.addJavascriptInterface(new AriaBridge(), "ARIA");
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setBuiltInZoomControls(false);
        web.loadUrl(URL);
        setContentView(web);
    }

    private void startVoiceServiceIfAllowed() {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) return;
        try {
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(new Intent(this, AriaVoiceService.class));
            else startService(new Intent(this, AriaVoiceService.class));
        } catch (Exception ignored) {}
    }

    private void authenticateBiometric() {
        try {
            BiometricPrompt prompt = new BiometricPrompt.Builder(this)
                    .setTitle("ورود به ARIA")
                    .setSubtitle("اثر انگشت یا قفل دستگاه")
                    .setDescription("برای ورود امن به دستیار")
                    .setNegativeButton("بعداً", getMainExecutor(), (dialog, which) -> {})
                    .build();
            Executor executor = getMainExecutor();
            prompt.authenticate(new android.os.CancellationSignal(), executor, new BiometricPrompt.AuthenticationCallback() {});
        } catch (Exception ignored) {}
    }

    private void handleWakeIntent(Intent intent) {
        if (intent != null && intent.getBooleanExtra("wake", false)) showWake(intent.getStringExtra("wake_text"));
    }

    private void showWake(String text) {
        if (web == null) return;
        try {
            String safe = JSONObject.quote(text == null ? "سلام آریا" : text);
            web.post(() -> web.evaluateJavascript("window.ariaWake && window.ariaWake(" + safe + ");", null));
        } catch (Exception ignored) {}
    }

    public class AriaBridge {
        @JavascriptInterface public void speak(String text) { runOnUiThread(() -> speakNative(text)); }
        @JavascriptInterface public void stopSpeaking() { runOnUiThread(() -> { if (tts != null) tts.stop(); }); }
        @JavascriptInterface public String voiceReady() { return tts != null ? "1" : "0"; }
    }

    private void speakNative(String text) {
        if (tts == null || text == null || text.trim().isEmpty()) return;
        String safe = text.trim();
        if (safe.length() > 4000) safe = safe.substring(0, 4000);
        try { tts.speak(safe, TextToSpeech.QUEUE_FLUSH, null, "aria-web-" + System.currentTimeMillis()); } catch (Exception ignored) {}
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleWakeIntent(intent);
    }

    @Override protected void onDestroy() {
        try { unregisterReceiver(wakeReceiver); } catch (Exception ignored) {}
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {} tts = null; }
        super.onDestroy();
    }

    @Override public void onBackPressed(){ if(web != null && web.canGoBack()) web.goBack(); else super.onBackPressed(); }
}
