package com.yasin.aria;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.webkit.*;
import android.view.ViewGroup;
import android.net.Uri;

public class MainActivity extends Activity {
    private static final String URL="https://aria-v4-production.up.railway.app/";
    private static final String WAKE="com.yasin.aria.WAKE";
    private WebView web;
    private ValueCallback<Uri[]> fileCallback;
    private final BroadcastReceiver receiver=new BroadcastReceiver(){
        @Override public void onReceive(Context c,Intent i){if(WAKE.equals(i.getAction())&&web!=null)web.post(()->web.evaluateJavascript("window.ariaWake&&window.ariaWake('سلام آریا')",null));}
    };
    @Override public void onCreate(Bundle b){super.onCreate(b);requestPermissions();buildWeb();register();startVoiceService();}
    private void requestPermissions(){if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},10);if(android.os.Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS},11);}
    private void buildWeb(){web=new WebView(this);web.setLayoutParams(new ViewGroup.LayoutParams(-1,-1));web.setBackgroundColor(0xff212121);WebSettings s=web.getSettings();s.setJavaScriptEnabled(true);s.setDomStorageEnabled(true);s.setDatabaseEnabled(true);s.setMediaPlaybackRequiresUserGesture(false);s.setAllowFileAccess(true);s.setAllowContentAccess(true);s.setSupportZoom(false);web.addJavascriptInterface(new Object(){@android.webkit.JavascriptInterface public void speak(String text){runOnUiThread(()->{android.speech.tts.TextToSpeech t=new android.speech.tts.TextToSpeech(MainActivity.this,status->{if(status==android.speech.tts.TextToSpeech.SUCCESS){t.setLanguage(new java.util.Locale("fa","IR"));t.speak(text,android.speech.tts.TextToSpeech.QUEUE_FLUSH,null,"aria");}});});}},"ARIA");web.setWebViewClient(new WebViewClient(){@Override public boolean shouldOverrideUrlLoading(WebView v,WebResourceRequest r){v.loadUrl(r.getUrl().toString());return true;}});web.setWebChromeClient(new WebChromeClient(){@Override public boolean onShowFileChooser(WebView v,ValueCallback<Uri[]> cb,FileChooserParams p){if(fileCallback!=null)fileCallback.onReceiveValue(null);fileCallback=cb;try{startActivityForResult(p.createIntent(),20);return true;}catch(Exception e){fileCallback=null;return false;}}@Override public void onPermissionRequest(PermissionRequest r){runOnUiThread(()->{if(checkSelfPermission(Manifest.permission.RECORD_AUDIO)==PackageManager.PERMISSION_GRANTED)r.grant(r.getResources());else r.deny();});}});setContentView(web);web.loadUrl(URL);}
    private void register(){IntentFilter f=new IntentFilter(WAKE);if(android.os.Build.VERSION.SDK_INT>=33)registerReceiver(receiver,f,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(receiver,f);}
    private void startVoiceService(){try{if(android.os.Build.VERSION.SDK_INT>=26)startForegroundService(new Intent(this,AriaVoiceService.class));else startService(new Intent(this,AriaVoiceService.class));}catch(Exception ignored){}}
    @Override protected void onActivityResult(int r,int c,Intent d){super.onActivityResult(r,c,d);if(r==20&&fileCallback!=null){Uri[] u=null;if(c==RESULT_OK&&d!=null){Uri x=d.getData();if(x!=null)u=new Uri[]{x};}fileCallback.onReceiveValue(u);fileCallback=null;}}
    @Override public void onBackPressed(){if(web!=null&&web.canGoBack())web.goBack();else super.onBackPressed();}
    @Override protected void onDestroy(){try{unregisterReceiver(receiver);}catch(Exception ignored){}if(web!=null)web.destroy();super.onDestroy();}
}
