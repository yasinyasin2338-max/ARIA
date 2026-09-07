package com.yasin.aria;

import android.Manifest;
import android.app.Activity;
import android.content.*;
import android.content.pm.PackageManager;
import android.database.Cursor;
import android.graphics.*;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.os.*;
import android.provider.ContactsContract;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;
import android.view.*;
import android.view.inputmethod.InputMethodManager;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

public class MainActivity extends Activity {
    private static final String API="https://aria-v4-production.up.railway.app";
    private static final String WAKE="com.yasin.aria.WAKE";
    private static final String RESULT="com.yasin.aria.RESULT";
    private LinearLayout root, chat;
    private TextView status;
    private EditText input;
    private Orb orb;
    private TextToSpeech tts;
    private SpeechRecognizer recognizer;
    private Uri selectedImage;
    private boolean listening=false;

    private final BroadcastReceiver receiver=new BroadcastReceiver(){ public void onReceive(Context c,Intent i){
        if(WAKE.equals(i.getAction())) { status.setText("گوش می‌دم…"); orb.active=true; orb.invalidate(); addMessage("ARIA","بله یاسین، گوش می‌دم."); }
        if(RESULT.equals(i.getAction())) { String a=i.getStringExtra("answer"); if(a!=null) { addMessage("ARIA",a); speak(a); } }
    }};

    @Override public void onCreate(Bundle b){ super.onCreate(b); getWindow().setStatusBarColor(Color.rgb(8,8,12));
        requestPermissions(); initTts(); buildUi(); register(); startServiceSafe();
    }
    private void requestPermissions(){ ArrayList<String> p=new ArrayList<>(); if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.RECORD_AUDIO); if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.POST_NOTIFICATIONS); if(checkSelfPermission(Manifest.permission.READ_CONTACTS)!=PackageManager.PERMISSION_GRANTED)p.add(Manifest.permission.READ_CONTACTS); if(!p.isEmpty())requestPermissions(p.toArray(new String[0]),10); }
    private void register(){ IntentFilter f=new IntentFilter(); f.addAction(WAKE);f.addAction(RESULT); if(Build.VERSION.SDK_INT>=33)registerReceiver(receiver,f,Context.RECEIVER_NOT_EXPORTED);else registerReceiver(receiver,f); }
    private void startServiceSafe(){ try{ if(Build.VERSION.SDK_INT>=26)startForegroundService(new Intent(this,AriaVoiceService.class));else startService(new Intent(this,AriaVoiceService.class)); }catch(Exception ignored){} }
    private GradientDrawable bg(int color,float r){ GradientDrawable g=new GradientDrawable();g.setColor(color);g.setCornerRadius(r);return g; }
    private TextView tv(String s,float size,int color){ TextView t=new TextView(this);t.setText(s);t.setTextSize(size);t.setTextColor(color);t.setGravity(Gravity.CENTER);return t; }
    private void buildUi(){
        root=new LinearLayout(this);root.setOrientation(LinearLayout.VERTICAL);root.setPadding(18,18,18,12);root.setBackgroundColor(Color.rgb(7,7,11));
        LinearLayout top=new LinearLayout(this);top.setGravity(Gravity.CENTER_VERTICAL); TextView title=tv("ARIA",24,Color.WHITE);title.setTypeface(null,1);top.addView(title,new LinearLayout.LayoutParams(0,60,1));
        status=tv("آماده‌ام — با صدا یا متن با من صحبت کن",14,Color.LTGRAY);top.addView(status,new LinearLayout.LayoutParams(-2,60));root.addView(top);
        FrameLayout center=new FrameLayout(this);orb=new Orb(this);FrameLayout.LayoutParams op=new FrameLayout.LayoutParams(250,250,Gravity.CENTER);center.addView(orb,op);orb.setOnClickListener(v->startListening());root.addView(center,new LinearLayout.LayoutParams(-1,0,1));
        ScrollView sv=new ScrollView(this);chat=new LinearLayout(this);chat.setOrientation(LinearLayout.VERTICAL);chat.setPadding(4,4,4,4);sv.addView(chat);root.addView(sv,new LinearLayout.LayoutParams(-1,230));
        LinearLayout tools=new LinearLayout(this);tools.setPadding(0,8,0,8); String[] names={"🎙 صحبت","🖼 تصویر","✏️ تغییر","🎬 ویدیو","📁 گالری"}; for(String n:names){Button x=new Button(this);x.setText(n);x.setTextSize(12);x.setTextColor(Color.WHITE);x.setBackground(bg(Color.rgb(25,25,32),40));tools.addView(x,new LinearLayout.LayoutParams(0,54,1)); if(n.startsWith("🎙"))x.setOnClickListener(v->startListening()); else if(n.startsWith("🖼"))x.setOnClickListener(v->generateImage()); else if(n.startsWith("✏️"))x.setOnClickListener(v->editImage()); else if(n.startsWith("🎬"))x.setOnClickListener(v->makeVideo()); else x.setOnClickListener(v->openGallery()); }
        root.addView(tools);
        LinearLayout bar=new LinearLayout(this);input=new EditText(this);input.setHint("پیامت را بنویس…");input.setHintTextColor(Color.GRAY);input.setTextColor(Color.WHITE);input.setSingleLine(false);input.setBackground(bg(Color.rgb(22,22,28),42));bar.addView(input,new LinearLayout.LayoutParams(0,62,1));Button send=new Button(this);send.setText("➤");send.setTextColor(Color.WHITE);send.setBackground(bg(Color.rgb(120,20,35),42));send.setOnClickListener(v->sendText());bar.addView(send,new LinearLayout.LayoutParams(62,62));root.addView(bar);setContentView(root);
    }
    private void addMessage(String who,String text){ TextView t=tv(who+"\n"+text,15,Color.WHITE);t.setGravity(Gravity.RIGHT|Gravity.CENTER_VERTICAL);t.setPadding(18,12,18,12);t.setBackground(bg(who.equals("ARIA")?Color.rgb(24,24,31):Color.rgb(65,18,28),28));LinearLayout.LayoutParams p=new LinearLayout.LayoutParams(-1,-2);p.setMargins(0,6,0,6);chat.addView(t,p);chat.post(()->((ScrollView)chat.getParent()).fullScroll(View.FOCUS_DOWN)); }
    private void sendText(){String s=input.getText().toString().trim();if(s.isEmpty())return;input.setText("");addMessage("یاسین",s);executeCommand(s);}
    private void startListening(){ if(listening)return; if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.RECORD_AUDIO)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.RECORD_AUDIO},10);return;} if(!SpeechRecognizer.isRecognitionAvailable(this)){status.setText("تشخیص گفتار روی این گوشی در دسترس نیست");return;} listening=true;status.setText("دارم گوش می‌دم…");orb.active=true;orb.invalidate(); recognizer=SpeechRecognizer.createSpeechRecognizer(this);recognizer.setRecognitionListener(new RecognitionListener(){public void onResults(Bundle r){listening=false;orb.active=false;orb.invalidate();ArrayList<String> m=r.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);if(m!=null&&!m.isEmpty()){String s=m.get(0);addMessage("یاسین",s);executeCommand(s);}status.setText("آماده‌ام");}public void onError(int e){listening=false;orb.active=false;orb.invalidate();status.setText("آماده‌ام");}public void onReadyForSpeech(Bundle b){}public void onBeginningOfSpeech(){}public void onRmsChanged(float v){}public void onBufferReceived(byte[] b){}public void onEndOfSpeech(){}public void onPartialResults(Bundle b){}public void onEvent(int a,Bundle b){}});Intent i=new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);i.putExtra(RecognizerIntent.EXTRA_LANGUAGE,"fa-IR");i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS,3);try{recognizer.startListening(i);}catch(Exception e){listening=false;status.setText("آماده‌ام");}}
    private void executeCommand(String raw){String s=norm(raw); if(s.contains("گالری")||s.contains("عکس ها")||s.contains("عکسها")){openGallery();return;} if(s.startsWith("تماس")||s.contains("زنگ بزن")||s.contains("تماس بگیر")){String q=s.replace("تماس بگیر","").replace("زنگ بزن","").replace("تماس","").trim();call(q);return;} if(s.startsWith("پیام")||s.contains("پیام بده")||s.contains("اس ام اس")){String q=s.replace("پیام بده","").replace("پیام","").trim();sms(q);return;} if(s.startsWith("باز کن")||s.startsWith("بازش کن")){openApp(s);return;} if(s.contains("تصویر بساز")||s.contains("عکس بساز")||s.contains("تصویر ایجاد کن")){String q=s.replace("تصویر بساز","").replace("عکس بساز","").replace("تصویر ایجاد کن","").trim();if(!q.isEmpty())input.setText(q);generateImage();return;} if(s.contains("ویدیو بساز")||s.contains("تبدیل به ویدیو")){makeVideo();return;} if(s.contains("تغییر بده")||s.contains("ویرایش کن")){editImage();return;} askChat(raw); }
    private String norm(String s){return s.toLowerCase(Locale.ROOT).replace('ي','ی').replace('ك','ک').replace("‌"," ").replaceAll("\\s+"," ").trim();}
    private void call(String q){String number=q.replaceAll("[^0-9+]+","");if(number.isEmpty())number=findContact(q);if(number==null||number.isEmpty()){speak("شماره یا مخاطب را پیدا نکردم.");return;}Intent i=new Intent(Intent.ACTION_DIAL,Uri.parse("tel:"+number));startActivity(i);}
    private String findContact(String name){if(Build.VERSION.SDK_INT>=23&&checkSelfPermission(Manifest.permission.READ_CONTACTS)!=PackageManager.PERMISSION_GRANTED){requestPermissions(new String[]{Manifest.permission.READ_CONTACTS},12);return null;}Cursor c=null;try{c=getContentResolver().query(ContactsContract.CommonDataKinds.Phone.CONTENT_URI,new String[]{ContactsContract.CommonDataKinds.Phone.NUMBER},ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME+" LIKE ?",new String[]{"%"+name+"%"},null);if(c!=null&&c.moveToFirst())return c.getString(0);}catch(Exception ignored){}finally{if(c!=null)c.close();}return null;}
    private void sms(String q){String number=q.replaceAll("[^0-9+]+","");if(number.isEmpty()){speak("برای پیامک، شماره را بگو یا مخاطب را همراه متن مشخص کن.");return;}String body=q.replace(number,"").trim();Intent i=new Intent(Intent.ACTION_SENDTO,Uri.parse("smsto:"+number));i.putExtra("sms_body",body);startActivity(i);}
    private void openApp(String s){String p=null;if(s.contains("اینستاگرام"))p="com.instagram.android";else if(s.contains("واتساپ"))p="com.whatsapp";else if(s.contains("تلگرام"))p="org.telegram.messenger";else if(s.contains("یوتیوب"))p="com.google.android.youtube";else if(s.contains("کروم"))p="com.android.chrome";if(p!=null){Intent i=getPackageManager().getLaunchIntentForPackage(p);if(i!=null){startActivity(i);return;}}speak("برنامه را پیدا نکردم.");}
    private void askChat(String s){status.setText("ARIA در حال فکر کردن…");new Thread(()->{try{JSONObject b=new JSONObject();b.put("message",s);b.put("memory","کاربر: یاسین\nزبان: فارسی\nرابط: ARIA Android");String r=post(API+"/api/chat",b.toString());JSONObject o=new JSONObject(r);String a=o.optString("text",o.optString("error","پاسخی دریافت نشد."));runOnUiThread(()->{addMessage("ARIA",a);status.setText("آماده‌ام");speak(a);});}catch(Exception e){runOnUiThread(()->{status.setText("آماده‌ام");speak("اتصال به سرور برقرار نشد.");});}}).start();}
    private void generateImage(){String p=input.getText().toString().trim();if(p.isEmpty()){speak("توضیح تصویر را بگو یا در کادر بنویس.");return;}input.setText("");addMessage("یاسین","تصویر: "+p);new Thread(()->{try{JSONObject b=new JSONObject();b.put("prompt",p);b.put("size","1024x1024");b.put("quality","high");String r=post(API+"/api/image",b.toString());JSONObject o=new JSONObject(r);String im=o.optString("image","");if(im.isEmpty())throw new Exception(o.optString("error","خطا"));runOnUiThread(()->showImage(im));}catch(Exception e){runOnUiThread(()->speak("تولید تصویر در سرویس رایگان فعلی فعال نیست یا خطایی رخ داد."));}}).start();}
    private void editImage(){if(selectedImage==null){speak("اول یک تصویر از گالری انتخاب کن.");openGallery();return;}String p=input.getText().toString().trim();if(p.isEmpty()){speak("بگو در تصویر چه چیزی را تغییر بدهم.");return;}new Thread(()->{try{String data=uriBase64(selectedImage);JSONObject b=new JSONObject();b.put("prompt",p);b.put("image",data);String r=post(API+"/api/image-edit",b.toString());JSONObject o=new JSONObject(r);String im=o.optString("image","");if(im.isEmpty())throw new Exception();runOnUiThread(()->showImage(im));}catch(Exception e){runOnUiThread(()->speak("ویرایش هوش مصنوعی تصویر در سرویس رایگان فعال نیست."));}}).start();}
    private void makeVideo(){String p=input.getText().toString().trim();if(p.isEmpty())p="این تصویر را به یک ویدیوی طبیعی تبدیل کن";new Thread(()->{try{JSONObject b=new JSONObject();b.put("prompt",p);b.put("mode","video");if(selectedImage!=null)b.put("image",uriBase64(selectedImage));String r=post(API+"/api/media",b.toString());JSONObject o=new JSONObject(r);String u=o.optString("url",o.optString("video",o.optString("output","")));runOnUiThread(()->{if(u.isEmpty())speak("سرویس ویدیو متصل نیست.");else{addMessage("ARIA","ویدیو آماده شد: "+u);try{startActivity(new Intent(Intent.ACTION_VIEW,Uri.parse(u)));}catch(Exception ignored){}}});}catch(Exception e){runOnUiThread(()->speak("سرویس ویدیو متصل نیست یا خطا داد."));}}).start();}
    private void showImage(String data){ImageView v=new ImageView(this);v.setAdjustViewBounds(true);v.setPadding(4,4,4,4);try{byte[] raw;if(data.startsWith("data:"))raw=Base64.getDecoder().decode(data.substring(data.indexOf(',')+1));else{InputStream in=new URL(data).openStream();ByteArrayOutputStream o=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))>0)o.write(b,0,n);raw=o.toByteArray();}v.setImageBitmap(BitmapFactory.decodeByteArray(raw,0,raw.length));chat.addView(v,new LinearLayout.LayoutParams(-1,520));}catch(Exception e){speak("نمایش تصویر ممکن نشد.");}}
    private void openGallery(){Intent i=new Intent(Intent.ACTION_OPEN_DOCUMENT);i.setType("image/*");i.addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(i,20);}
    @Override protected void onActivityResult(int r,int c,Intent d){super.onActivityResult(r,c,d);if(r==20&&c==RESULT_OK&&d!=null){selectedImage=d.getData();try{getContentResolver().takePersistableUriPermission(selectedImage,d.getFlags()&(Intent.FLAG_GRANT_READ_URI_PERMISSION|Intent.FLAG_GRANT_WRITE_URI_PERMISSION));}catch(Exception ignored){}addMessage("ARIA","تصویر انتخاب شد؛ حالا بگو چه تغییری می‌خواهی.");}}
    private String uriBase64(Uri u)throws Exception{InputStream in=getContentResolver().openInputStream(u);ByteArrayOutputStream o=new ByteArrayOutputStream();byte[] b=new byte[8192];int n;while((n=in.read(b))>0)o.write(b,0,n);in.close();return "data:image/jpeg;base64,"+Base64.getEncoder().encodeToString(o.toByteArray());}
    private String post(String url,String body)throws Exception{HttpURLConnection c=(HttpURLConnection)new URL(url).openConnection();c.setRequestMethod("POST");c.setConnectTimeout(7000);c.setReadTimeout(30000);c.setDoOutput(true);c.setRequestProperty("Content-Type","application/json; charset=UTF-8");try(OutputStream o=c.getOutputStream()){o.write(body.getBytes(StandardCharsets.UTF_8));}int code=c.getResponseCode();InputStream in=code>=400?c.getErrorStream():c.getInputStream();BufferedReader r=new BufferedReader(new InputStreamReader(in,StandardCharsets.UTF_8));StringBuilder s=new StringBuilder();String l;while((l=r.readLine())!=null)s.append(l);c.disconnect();return s.toString();}
    private void initTts(){tts=new TextToSpeech(this,x->{try{tts.setLanguage(new Locale("fa","IR"));tts.setSpeechRate(1.02f);tts.setPitch(1.08f);if(Build.VERSION.SDK_INT>=21)for(Voice v:tts.getVoices()){if(v.getLocale().getLanguage().equals("fa")){tts.setVoice(v);break;}}}catch(Exception ignored){}});}
    private void speak(String s){if(tts==null||s==null)return;tts.speak(s.length()>1800?s.substring(0,1800):s,TextToSpeech.QUEUE_FLUSH,null,"aria-"+System.currentTimeMillis());}
    @Override protected void onDestroy(){try{unregisterReceiver(receiver);}catch(Exception ignored){}if(recognizer!=null)recognizer.destroy();if(tts!=null){tts.stop();tts.shutdown();}super.onDestroy();}
    public static class Orb extends View{Paint p=new Paint(3);boolean active=false;float phase=0;public Orb(Context c){super(c);p.setStyle(Paint.Style.FILL);post(new Runnable(){public void run(){phase+=0.08f;invalidate();postDelayed(this,32);}});}protected void onDraw(Canvas c){float x=getWidth()/2f,y=getHeight()/2f;for(int k=6;k>=0;k--){float r=55+k*17+(active?(float)Math.sin(phase+k)*6:0);p.setShader(new RadialGradient(x,y,150,new int[]{Color.WHITE,Color.rgb(255,80,100),Color.rgb(120,10,40),Color.TRANSPARENT},new float[]{0,.35f,.72f,1},Shader.TileMode.CLAMP));c.drawCircle(x,y,r,p);}p.setShader(null);p.setColor(Color.WHITE);c.drawCircle(x,y,52+(active?(float)Math.sin(phase)*4:0),p);p.setColor(Color.rgb(170,20,45));c.drawCircle(x,y,32,p);}}
}
