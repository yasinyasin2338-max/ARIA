package com.yasin.aria;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.Service;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;

import java.util.ArrayList;
import java.util.Locale;

public class AriaVoiceService extends Service {
    private static final String CHANNEL_ID = "aria_voice";
    private static final int NOTIFICATION_ID = 7001;
    private static final String WAKE_ACTION = "com.yasin.aria.WAKE";
    private SpeechRecognizer recognizer;
    private final Handler handler = new Handler();
    private boolean running;

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
        startForeground(NOTIFICATION_ID, notification("آریا فعال است؛ آماده شنیدن «سلام آریا»"));
    }

    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (Build.VERSION.SDK_INT >= 23 && checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            stopSelf();
            return START_NOT_STICKY;
        }
        running = true;
        startListening();
        return START_STICKY;
    }

    private void startListening() {
        if (!running || !SpeechRecognizer.isRecognitionAvailable(this)) return;
        if (recognizer != null) try { recognizer.destroy(); } catch (Exception ignored) {}
        recognizer = SpeechRecognizer.createSpeechRecognizer(this);
        recognizer.setRecognitionListener(new RecognitionListener() {
            @Override public void onResults(Bundle results) { handle(results); restartSoon(); }
            @Override public void onPartialResults(Bundle results) { handle(results); }
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
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 3);
        try { recognizer.startListening(i); } catch (Exception e) { restartSoon(); }
    }

    private void handle(Bundle results) {
        if (results == null) return;
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null) return;
        for (String raw : matches) {
            String text = normalize(raw);
            if (text.contains("سلام اریا") || text.contains("سلام آریا") || text.equals("اریا") || text.equals("آریا")) {
                Intent wake = new Intent(WAKE_ACTION);
                wake.setPackage(getPackageName());
                wake.putExtra("text", raw);
                sendBroadcast(wake);
                showNotification("بله، یاسین؟");
                Intent open = new Intent(this, MainActivity.class);
                open.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
                open.putExtra("wake", true);
                open.putExtra("wake_text", raw);
                try { startActivity(open); } catch (Exception ignored) {}
                break;
            }
        }
    }

    private String normalize(String s) {
        return String.valueOf(s).toLowerCase(Locale.ROOT)
                .replace('ي', 'ی').replace('ى', 'ی').replace('ك', 'ک')
                .replace("‌", " ").replaceAll("\\s+", " ").trim();
    }

    private void restartSoon() {
        if (!running) return;
        handler.postDelayed(this::startListening, 350);
    }

    private Notification notification(String text) {
        if (Build.VERSION.SDK_INT >= 26) {
            return new Notification.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                    .setContentTitle("ARIA")
                    .setContentText(text)
                    .setOngoing(true)
                    .setCategory(Notification.CATEGORY_SERVICE)
                    .build();
        }
        return new Notification.Builder(this)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("ARIA")
                .setContentText(text)
                .setOngoing(true)
                .build();
    }

    private void createChannel() {
        if (Build.VERSION.SDK_INT >= 26) {
            NotificationChannel c = new NotificationChannel(CHANNEL_ID, "ARIA Voice", NotificationManager.IMPORTANCE_LOW);
            c.setDescription("Voice wake service for ARIA");
            getSystemService(NotificationManager.class).createNotificationChannel(c);
        }
    }

    private void showNotification(String text) {
        getSystemService(NotificationManager.class).notify(NOTIFICATION_ID, notification(text));
    }

    @Override public void onDestroy() {
        running = false;
        handler.removeCallbacksAndMessages(null);
        if (recognizer != null) { try { recognizer.cancel(); } catch (Exception ignored) {} recognizer.destroy(); recognizer = null; }
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
