package com.yasin.aria;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import org.json.JSONObject;
import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Locale;
import java.util.Set;

public class AriaVoiceService extends Service {
    private static final String CHANNEL_ID = "aria_voice";
    private static final int NOTIFICATION_ID = 7001;
    private static final String WAKE_ACTION = "com.yasin.aria.WAKE";
    private static final String ARIA_URL = "https://aria-v4-production.up.railway.app/api/chat";
    private SpeechRecognizer recognizer;
    private TextToSpeech tts;
    private final Handler handler = new Handler();
    private boolean running;
    private boolean awaitingCommand;
    private long lastWakeAt;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        Notification n = notification("آریا فعال است؛ برای شروع بگو «سلام آریا»");
        if (Build.VERSION.SDK_INT >= 29) startForeground(NOTIFICATION_ID, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE);
        else startForeground(NOTIFICATION_ID, n);
        tts = new TextToSpeech(this, status -> {
            if (status != TextToSpeech.SUCCESS || tts == null) return;
            try {
                tts.setLanguage(new Locale("fa", "IR"));
                tts.setSpeechRate(1.03f);
                tts.setPitch(1.08f);
                if (Build.VERSION.SDK_INT >= 21) {
                    Set<Voice> voices = tts.getVoices();
                    Voice best = null;
                    if (voices != null) for (Voice v : voices) {
                        Locale l = v.getLocale();
                        String n = String.valueOf(v.getName()).toLowerCase(Locale.ROOT);
                        if (l != null && l.getLanguage().equals("fa")) {
                            if (n.contains("female") || n.contains("woman") || n.contains("girl") || n.contains("sara") || n.contains("zira")) { best = v; break; }
                            if (best == null) best = v;
                        }
                    }
                    if (best != null) tts.setVoice(best);
                }
            } catch (Exception ignored) {}
        });
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) { stopSelf(); return START_NOT_STICKY; }
        running = true;
        awaitingCommand = false;
        startListening();
        return START_STICKY;
    }

    private void startListening() {
        if (!running || !SpeechRecognizer.isRecognitionAvailable(this)) return;
        if (recognizer != null) try { recognizer.destroy(); } catch (Exception ignored) {}
        recognizer = Build.VERSION.SDK_INT >= 31 && SpeechRecognizer.isOnDeviceRecognitionAvailable(this)
                ? SpeechRecognizer.createOnDeviceSpeechRecognizer(this)
                : SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onResults(Bundle results) { handleFinal(results); }
            @Override public void onPartialResults(Bundle results) {}
            @Override public void onError(int error) { restartSoon(); }
            @Override public void onReadyForSpeech(Bundle p) {}
            @Override public void onBeginningOfSpeech() {}
            @Override public void onRmsChanged(float rms) {}
            @Override public void onBufferReceived(byte[] b) {}
            @Override public void onEndOfSpeech() {}
            @Override public void onEvent(int type, Bundle p) {}
        });
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "fa-IR");
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, "fa-IR");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, false);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try { recognizer.startListening(i); } catch (Exception e) { restartSoon(); }
    }

    private void handleFinal(Bundle results) {
        if (results == null) { restartSoon(); return; }
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null || matches.isEmpty()) { restartSoon(); return; }
        String raw = matches.get(0);
        String text = normalize(raw);
        if (!awaitingCommand && isWake(text)) {
            long now = System.currentTimeMillis();
            if (now - lastWakeAt < 1800) { restartSoon(); return; }
            lastWakeAt = now;
            awaitingCommand = true;
            sendWakeBroadcast(raw);
            speak("بله یاسین، گوش می‌دم.", this::restartListeningForCommand);
            return;
        }
        if (awaitingCommand) {
            awaitingCommand = false;
            if (!text.isEmpty()) askAria(text); else restartSoon();
            return;
        }
        restartSoon();
    }

    private boolean isWake(String text) { return text.contains("سلام اریا") || text.contains("سلام آریا") || text.equals("اریا") || text.equals("آریا") || text.contains("هی اریا"); }

    private void sendWakeBroadcast(String raw) {
        Intent wake = new Intent(WAKE_ACTION);
        wake.setPackage(getPackageName());
        wake.putExtra("text", raw);
        sendBroadcast(wake);
        showNotification("بله یاسین؟ منتظرم...");
    }

    private void restartListeningForCommand() { if (running) handler.postDelayed(this::startListening, 150); }

    private void askAria(final String text) {
        new Thread(() -> {
            HttpURLConnection c = null;
            try {
                URL u = new URL(ARIA_URL);
                c = (HttpURLConnection) u.openConnection();
                c.setRequestMethod("POST");
                c.setConnectTimeout(5000);
                c.setReadTimeout(15000);
                c.setDoOutput(true);
                c.setRequestProperty("Content-Type", "application/json; charset=UTF-8");
                JSONObject body = new JSONObject();
                body.put("message", text);
                body.put("memory", "کاربر: یاسین\nرابط: ARIA Voice\nزبان: فارسی");
                byte[] bytes = body.toString().getBytes(StandardCharsets.UTF_8);
                try (OutputStream out = c.getOutputStream()) { out.write(bytes); }
                int code = c.getResponseCode();
                BufferedReader reader = new BufferedReader(new InputStreamReader(code >= 400 ? c.getErrorStream() : c.getInputStream(), StandardCharsets.UTF_8));
                StringBuilder sb = new StringBuilder(); String line;
                while ((line = reader.readLine()) != null) sb.append(line);
                JSONObject response = new JSONObject(sb.toString());
                String answer = response.optString("text", "");
                if (answer.isEmpty()) answer = response.optString("error", "پاسخی دریافت نشد.");
                final String spoken = answer;
                handler.post(() -> speak(spoken, this::restartSoon));
            } catch (Exception e) {
                handler.post(() -> speak("اتصال به آریا برقرار نشد.", this::restartSoon));
            } finally { if (c != null) c.disconnect(); }
        }).start();
    }

    private void speak(String text, Runnable after) {
        if (!running) return;
        if (tts == null) { if (after != null) after.run(); return; }
        String safe = text == null ? "" : text.trim();
        if (safe.length() > 1800) safe = safe.substring(0, 1800);
        final String utterance = safe;
        tts.setOnUtteranceProgressListener(new android.speech.tts.UtteranceProgressListener() {
            @Override public void onStart(String id) {}
            @Override public void onDone(String id) { if (after != null) handler.post(after); }
            @Override public void onError(String id) { if (after != null) handler.post(after); }
        });
        tts.speak(utterance, TextToSpeech.QUEUE_FLUSH, null, "aria-" + System.currentTimeMillis());
    }

    private String normalize(String s) { return String.valueOf(s).toLowerCase(Locale.ROOT).replace('ي','ی').replace('ى','ی').replace('ك','ک').replace("‌"," ").replaceAll("\\s+"," ").trim(); }
    private void restartSoon() { if (running) handler.postDelayed(this::startListening, 400); }

    private Notification notification(String text) {
        if (Build.VERSION.SDK_INT >= 26) return new Notification.Builder(this, CHANNEL_ID).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("ARIA").setContentText(text).setOngoing(true).setCategory(Notification.CATEGORY_SERVICE).build();
        return new Notification.Builder(this).setSmallIcon(android.R.drawable.ic_btn_speak_now).setContentTitle("ARIA").setContentText(text).setOngoing(true).build();
    }
    private void createChannel() { if (Build.VERSION.SDK_INT >= 26) { NotificationChannel c = new NotificationChannel(CHANNEL_ID,"ARIA Voice",NotificationManager.IMPORTANCE_LOW); c.setDescription("Voice assistant"); getSystemService(NotificationManager.class).createNotificationChannel(c); } }
    private void showNotification(String text) { getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(text)); }

    @Override public void onDestroy() {
        running = false; handler.removeCallbacksAndMessages(null);
        if (recognizer != null) { try { recognizer.cancel(); } catch (Exception ignored) {} recognizer.destroy(); recognizer = null; }
        if (tts != null) { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {} tts = null; }
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}
