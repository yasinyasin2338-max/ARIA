package ir.yasin.hamhoosh

import android.app.Activity
import android.app.AlertDialog
import android.content.*
import android.database.Cursor
import android.database.sqlite.*
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.speech.RecognizerIntent
import android.speech.tts.TextToSpeech
import android.text.InputType
import android.view.*
import android.widget.*
import dev.ffmpegkit.llama.*
import kotlinx.coroutines.*
import java.io.*
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale

class MainActivity : Activity() {
    companion object {
        private const val SPEECH_REQUEST = 101
        private const val BG = 0xFF0B1218.toInt()
        private const val PANEL = 0xFF131F28.toInt()
        private const val PANEL2 = 0xFF192A35.toInt()
        private const val ACCENT = 0xFF66E3CF.toInt()
        private const val TEXT = 0xFFF2F7F9.toInt()
        private const val MUTED = 0xFF9FB0B9.toInt()
        private const val SYSTEM_PROMPT = """تو «همهوش» هستی؛ یک دستیار شخصی فارسی‌زبان که کاملاً روی گوشی کاربر اجرا می‌شود.
به فارسی روان، روشن، دقیق و کاربردی پاسخ بده مگر کاربر زبان دیگری بخواهد.
اگر چیزی را نمی‌دانی یا اطلاعات زنده لازم دارد، صریح بگو و حدس ساختگی نزن.
به خاطر محلی بودن مدل، ادعای جست‌وجوی وب، دسترسی به حساب‌ها یا انجام عمل خارجی نکن.
در پاسخ‌های روزمره مختصر و در کارهای فنی مرحله‌به‌مرحله باش.
بین واقعیت، احتمال و پیشنهاد فرق بگذار."""
    }

    data class ModelSpec(
        val id:String,val title:String,val subtitle:String,val fileName:String,val url:String,
        val sizeLabel:String,val expectedBytes:Long,val contextSize:Int,val threads:Int
    )

    private val proModel = ModelSpec(
        "qwen15","کیفیت بهتر • Qwen2.5 1.5B","پیشنهادی برای Galaxy S22 Ultra",
        "qwen2.5-1.5b-instruct-q4_k_m.gguf",
        "https://huggingface.co/Qwen/Qwen2.5-1.5B-Instruct-GGUF/resolve/main/qwen2.5-1.5b-instruct-q4_k_m.gguf?download=true",
        "حدود ۱ گیگابایت",986L*1024L*1024L,3072,6
    )
    private val liteModel = ModelSpec(
        "qwen05","سبک و سریع • Qwen2.5 0.5B","مصرف حافظه کمتر، کیفیت پایین‌تر",
        "qwen2.5-0.5b-instruct-q4_k_m.gguf",
        "https://huggingface.co/Qwen/Qwen2.5-0.5B-Instruct-GGUF/resolve/main/qwen2.5-0.5b-instruct-q4_k_m.gguf?download=true",
        "حدود ۴۹۱ مگابایت",491L*1024L*1024L,2048,6
    )
    private val models = listOf(proModel,liteModel)
    private val scope = CoroutineScope(SupervisorJob()+Dispatchers.Main)

    private lateinit var prefs:SharedPreferences
    private lateinit var store:Store
    private lateinit var feed:LinearLayout
    private lateinit var scroll:ScrollView
    private lateinit var draft:EditText
    private lateinit var send:Button
    private lateinit var mic:Button
    private lateinit var clear:Button
    private lateinit var modelButton:Button
    private lateinit var downloadButton:Button
    private lateinit var status:TextView
    private lateinit var modelStatus:TextView
    private lateinit var progress:ProgressBar
    private lateinit var progressText:TextView
    private lateinit var voice:Switch
    private var tts:TextToSpeech?=null
    private var voiceReady=false
    private var model:LlamaModel?=null
    private var downloadJob:Job?=null
    private var chatJob:Job?=null
    private var modelBusy=false
    private var chatBusy=false

    override fun onCreate(state:Bundle?){
        super.onCreate(state)
        prefs=getSharedPreferences("hamhoosh_local",MODE_PRIVATE)
        store=Store(this)
        buildUi()
        loadHistory()
        initTts()
        refreshModelUi(true)
    }

    private fun selectedSpec():ModelSpec {
        val id=prefs.getString("model_id",proModel.id)
        return models.firstOrNull{it.id==id}?:proModel
    }
    private fun modelDir()=File(getExternalFilesDir(null),"models").apply{mkdirs()}
    private fun modelFile(spec:ModelSpec=selectedSpec())=File(modelDir(),spec.fileName)

    private fun buildUi(){
        val root=LinearLayout(this).apply{
            orientation=LinearLayout.VERTICAL
            setBackgroundColor(BG)
            layoutDirection=View.LAYOUT_DIRECTION_RTL
            setPadding(dp(16),dp(14),dp(16),dp(12))
            setOnApplyWindowInsetsListener{v,i->
                val top:Int; val bottom:Int
                if(Build.VERSION.SDK_INT>=30){
                    val b=i.getInsets(WindowInsets.Type.systemBars() or WindowInsets.Type.ime())
                    top=b.top;bottom=b.bottom
                } else { top=i.systemWindowInsetTop;bottom=i.systemWindowInsetBottom }
                v.setPadding(dp(16),dp(12)+top,dp(16),dp(10)+bottom);i
            }
        }
        val header=LinearLayout(this).apply{
            orientation=LinearLayout.VERTICAL;background=roundRect(PANEL,22)
            setPadding(dp(16),dp(14),dp(16),dp(14))
        }
        header.addView(TextView(this).apply{
            text="همهوش";textSize=30f;setTextColor(ACCENT);setTypeface(typeface,Typeface.BOLD)
        })
        header.addView(TextView(this).apply{
            text="دستیار محلی فارسی • بدون API • بدون هزینهٔ پیام";textSize=13f;setTextColor(MUTED)
            setPadding(0,dp(3),0,dp(8))
        })
        header.addView(TextView(this).apply{
            text="● خصوصی  •  آفلاین بعد از دانلود مدل  •  رایگان";textSize=12f;setTextColor(ACCENT)
            background=roundRect(PANEL2,14);setPadding(dp(10),dp(8),dp(10),dp(8))
        })
        root.addView(header,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(10)})

        val card=LinearLayout(this).apply{
            orientation=LinearLayout.VERTICAL;background=roundRect(PANEL,20)
            setPadding(dp(14),dp(12),dp(14),dp(12))
        }
        modelStatus=TextView(this).apply{textSize=15f;setTextColor(TEXT);setTypeface(typeface,Typeface.BOLD)}
        status=TextView(this).apply{textSize=12f;setTextColor(MUTED);setPadding(0,dp(4),0,dp(8))}
        progress=ProgressBar(this,null,android.R.attr.progressBarStyleHorizontal).apply{max=1000;visibility=View.GONE}
        progressText=TextView(this).apply{textSize=12f;setTextColor(MUTED);visibility=View.GONE}
        card.addView(modelStatus);card.addView(status);card.addView(progress,LinearLayout.LayoutParams(-1,dp(6)));card.addView(progressText)
        val actions=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        modelButton=actionButton("انتخاب مدل",false);downloadButton=actionButton("دانلود مدل",true)
        actions.addView(modelButton,weight());actions.addView(downloadButton,weight());card.addView(actions)
        root.addView(card,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})

        val utilities=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        clear=actionButton("پاک‌کردن گفتگو",false)
        voice=Switch(this).apply{text="خواندن پاسخ";setTextColor(TEXT);textSize=13f;isEnabled=false;gravity=Gravity.CENTER_VERTICAL}
        utilities.addView(clear,weight());utilities.addView(voice,weight());root.addView(utilities)

        scroll=ScrollView(this).apply{isFillViewport=true;overScrollMode=View.OVER_SCROLL_NEVER}
        feed=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,dp(6),0,dp(8))}
        scroll.addView(feed);root.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))

        val composer=LinearLayout(this).apply{
            orientation=LinearLayout.VERTICAL;background=roundRect(PANEL,22);setPadding(dp(10),dp(8),dp(10),dp(10))
        }
        draft=EditText(this).apply{
            hint="پیامت را بنویس…";setHintTextColor(MUTED);setTextColor(TEXT);textSize=16f;minLines=2;maxLines=5
            inputType=InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE or InputType.TYPE_TEXT_FLAG_CAP_SENTENCES
            background=null;setPadding(dp(8),dp(6),dp(8),dp(6))
        }
        composer.addView(draft)
        val sendRow=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
        mic=actionButton("🎙 گفتن",false);send=actionButton("ارسال",true)
        sendRow.addView(mic,weight());sendRow.addView(send,weight());composer.addView(sendRow);root.addView(composer)
        setContentView(root);root.requestApplyInsets()

        modelButton.setOnClickListener{chooseModel()}
        downloadButton.setOnClickListener{
            if(downloadJob?.isActive==true) downloadJob?.cancel() else startDownload()
        }
        send.setOnClickListener{submit()};mic.setOnClickListener{recognize()};clear.setOnClickListener{confirmClear()}
        voice.setOnCheckedChangeListener{_,checked->if(!checked)tts?.stop()}
    }

    private fun actionButton(value:String,primary:Boolean)=Button(this).apply{
        text=value;isAllCaps=false;textSize=14f;setTextColor(if(primary)BG else TEXT)
        background=roundRect(if(primary)ACCENT else PANEL2,16);minHeight=dp(46)
    }
    private fun weight()=LinearLayout.LayoutParams(0,-2,1f).apply{setMargins(dp(3),dp(4),dp(3),dp(4))}
    private fun roundRect(color:Int,radius:Int)=GradientDrawable().apply{setColor(color);cornerRadius=dp(radius).toFloat()}
    private fun dp(v:Int)=(v*resources.displayMetrics.density+0.5f).toInt()

    private fun refreshModelUi(autoLoad:Boolean=false){
        val spec=selectedSpec();val file=modelFile(spec);modelStatus.text=spec.title
        when{
            modelBusy->Unit
            model?.isLoaded==true->{status.text="مدل آماده است؛ گفتگو روی خود گوشی پردازش می‌شود.";downloadButton.text="آماده ✓";downloadButton.isEnabled=false}
            file.exists()->{status.text="فایل مدل موجود است؛ آمادهٔ بارگذاری.";downloadButton.text="بارگذاری مدل";downloadButton.isEnabled=true;if(autoLoad)loadSelectedModel()}
            else->{status.text="${spec.subtitle} • ${spec.sizeLabel}";downloadButton.text="دانلود رایگان";downloadButton.isEnabled=true}
        }
        updateComposerEnabled()
    }

    private fun chooseModel(){
        if(modelBusy||chatBusy)return
        val selected=selectedSpec()
        val labels=models.map{"${it.title}\n${it.sizeLabel} • ${it.subtitle}"}.toTypedArray()
        var choice=models.indexOfFirst{it.id==selected.id}.coerceAtLeast(0)
        AlertDialog.Builder(this).setTitle("مدل هوش مصنوعی")
            .setSingleChoiceItems(labels,choice){_,w->choice=w}
            .setMessage("هر دو مدل رایگان و محلی‌اند. مدل 1.5B کیفیت بهتر و مدل 0.5B سرعت بیشتر دارد.")
            .setNegativeButton("انصراف",null)
            .setNeutralButton("حذف فایل مدل فعلی"){_,_->deleteSelectedModel()}
            .setPositiveButton("انتخاب"){_,_->
                val newSpec=models[choice]
                if(newSpec.id!=selected.id){releaseCurrentModel();prefs.edit().putString("model_id",newSpec.id).apply();refreshModelUi(true)}
            }.show()
    }

    private fun deleteSelectedModel(){
        if(modelBusy||chatBusy)return
        releaseCurrentModel()
        val file=modelFile();val part=File(file.absolutePath+".part")
        if(file.exists())file.delete();if(part.exists())part.delete()
        Toast.makeText(this,"فایل مدل حذف شد.",Toast.LENGTH_LONG).show();refreshModelUi(false)
    }

    private fun startDownload(){
        if(modelBusy||chatBusy)return
        val spec=selectedSpec();val target=modelFile(spec)
        if(target.exists()){loadSelectedModel();return}
        val available=StatFs(modelDir().absolutePath).availableBytes
        if(available<spec.expectedBytes+200L*1024L*1024L){
            Toast.makeText(this,"فضای خالی کافی نیست.",Toast.LENGTH_LONG).show();return
        }
        modelBusy=true;progress.visibility=View.VISIBLE;progressText.visibility=View.VISIBLE
        downloadButton.text="لغو دانلود";modelButton.isEnabled=false;status.text="در حال دانلود مدل رایگان…";updateComposerEnabled()
        downloadJob=scope.launch{
            try{
                withContext(Dispatchers.IO){downloadWithResume(spec,target)}
                progress.progress=1000;progressText.text="دانلود کامل شد؛ در حال بارگذاری…"
                loadSelectedModelInternal()
            }catch(_:CancellationException){status.text="دانلود متوقف شد؛ دفعه بعد ادامه می‌یابد."}
            catch(t:Throwable){status.text="دانلود ناموفق بود: ${friendlyError(t)}";Toast.makeText(this@MainActivity,"دانلود کامل نشد؛ دوباره تلاش کن.",Toast.LENGTH_LONG).show()}
            finally{
                modelBusy=false;progress.visibility=View.GONE;progressText.visibility=View.GONE;modelButton.isEnabled=true;downloadJob=null;refreshModelUi(false)
            }
        }
    }

    private suspend fun downloadWithResume(spec:ModelSpec,target:File){
        val part=File(target.absolutePath+".part");var existing=if(part.exists())part.length() else 0L
        val c=(URL(spec.url).openConnection() as HttpURLConnection).apply{
            instanceFollowRedirects=true;connectTimeout=20000;readTimeout=60000
            setRequestProperty("User-Agent","HamHoosh/1.1 Android")
            if(existing>0)setRequestProperty("Range","bytes=${existing}-")
        }
        try{
            c.connect();val code=c.responseCode
            if(code!=HttpURLConnection.HTTP_OK&&code!=HttpURLConnection.HTTP_PARTIAL)throw IllegalStateException("HTTP ${code}")
            val append=code==HttpURLConnection.HTTP_PARTIAL&&existing>0
            if(!append){existing=0;if(part.exists())part.delete()}
            val responseLength=c.contentLengthLong.coerceAtLeast(0L)
            val total=if(responseLength>0)existing+responseLength else spec.expectedBytes
            c.inputStream.use{input->FileOutputStream(part,append).use{output->
                val buffer=ByteArray(256*1024);var written=existing;var lastUi=0L
                while(true){
                    currentCoroutineContext().ensureActive();val n=input.read(buffer);if(n<0)break
                    output.write(buffer,0,n);written+=n
                    val now=System.currentTimeMillis()
                    if(now-lastUi>250){lastUi=now
                        val p=((written.toDouble()/total.coerceAtLeast(1))*1000).toInt().coerceIn(0,999)
                        val done=written/(1024L*1024L);val all=total/(1024L*1024L)
                        runOnUiThread{progress.progress=p;progressText.text="${done} / ${all} مگابایت"}
                    }
                };output.fd.sync()
            }}
            if(part.length()<100L*1024L*1024L)throw IllegalStateException("فایل دریافت‌شده معتبر نیست.")
            if(target.exists())target.delete()
            if(!part.renameTo(target)){part.copyTo(target,true);part.delete()}
        }finally{c.disconnect()}
    }

    private fun loadSelectedModel(){
        if(modelBusy||chatBusy||model?.isLoaded==true)return
        modelBusy=true;modelButton.isEnabled=false;downloadButton.isEnabled=false;status.text="در حال بارگذاری مدل در حافظه…";updateComposerEnabled()
        scope.launch{
            try{loadSelectedModelInternal()}
            catch(t:Throwable){status.text="بارگذاری ناموفق بود: ${friendlyError(t)}";Toast.makeText(this@MainActivity,"مدل بارگذاری نشد؛ فایل را حذف و دوباره دانلود کن.",Toast.LENGTH_LONG).show()}
            finally{modelBusy=false;modelButton.isEnabled=true;refreshModelUi(false)}
        }
    }

    private suspend fun loadSelectedModelInternal(){
        releaseCurrentModel();val spec=selectedSpec();val file=modelFile(spec)
        if(!file.exists())throw IllegalStateException("فایل مدل پیدا نشد.")
        model=Llama.loadModel(file.absolutePath,LlamaConfig(contextSize=spec.contextSize,threads=spec.threads,temperature=0.7f,topP=0.9f,topK=40))
        status.text="مدل آماده است؛ همهٔ پیام‌ها محلی پردازش می‌شوند.";downloadButton.text="آماده ✓";downloadButton.isEnabled=false;updateComposerEnabled()
    }
    private fun releaseCurrentModel(){model?.let{try{Llama.releaseModel(it)}catch(_:Throwable){}};model=null}

    private fun submit(){
        if(chatBusy||modelBusy)return
        val active=model
        if(active==null||!active.isLoaded){Toast.makeText(this,"اول مدل رایگان را دانلود و آماده کن.",Toast.LENGTH_LONG).show();return}
        val text=draft.text.toString().trim();if(text.isEmpty())return
        if(text.length>6000){Toast.makeText(this,"پیام را کوتاه‌تر بفرست.",Toast.LENGTH_LONG).show();return}
        save("user",text);draft.setText("");tts?.stop();chatBusy=true;status.text="همهوش روی خود گوشی در حال فکر کردن است…";send.text="در حال پاسخ…";updateComposerEnabled()
        chatJob=scope.launch{
            try{
                val result=Llama.complete(active,buildConversationPrompt(),SYSTEM_PROMPT.trimIndent(),420)
                val answer=result.text.trim().ifBlank{"پاسخ معتبری تولید نشد."};save("assistant",answer)
                val speed=String.format(Locale.US,"%.1f",result.tokensPerSecond);status.text="آماده • ${result.tokensGenerated} توکن • ${speed} توکن/ثانیه";speak(answer)
            }catch(t:Throwable){status.text="تولید پاسخ ناموفق بود: ${friendlyError(t)}";bubble("assistant","پاسخ تولید نشد. دوباره تلاش کن یا مدل سبک‌تر را انتخاب کن.")}
            finally{chatBusy=false;chatJob=null;send.text="ارسال";updateComposerEnabled()}
        }
    }

    private fun buildConversationPrompt():String{
        val sb=StringBuilder("گفت‌وگوی اخیر:\n")
        store.readRecent(10).forEach{(role,body)->sb.append(if(role=="user")"کاربر: " else "همهوش: ").append(body).append('\n')}
        sb.append("همهوش:");return sb.toString()
    }
    private fun updateComposerEnabled(){
        val ready=model?.isLoaded==true&&!modelBusy&&!chatBusy;send.isEnabled=ready;mic.isEnabled=!modelBusy&&!chatBusy;draft.isEnabled=!modelBusy&&!chatBusy;clear.isEnabled=!chatBusy
    }

    private fun save(role:String,body:String){store.insert(role,body);bubble(role,body)}
    private fun loadHistory(){store.readRecent(100).forEach{bubble(it.first,it.second)}}
    private fun bubble(role:String,body:String){
        val user=role=="user";val card=LinearLayout(this).apply{
            orientation=LinearLayout.VERTICAL;background=roundRect(if(user)0xFF17464A.toInt() else PANEL,18);setPadding(dp(13),dp(10),dp(13),dp(10))
        }
        card.addView(TextView(this).apply{text=if(user)"شما" else "همهوش";textSize=11f;setTextColor(if(user)ACCENT else MUTED);setTypeface(typeface,Typeface.BOLD)})
        card.addView(TextView(this).apply{text=body;textSize=16f;setTextColor(TEXT);setTextIsSelectable(true);textDirection=View.TEXT_DIRECTION_FIRST_STRONG;setLineSpacing(dp(2).toFloat(),1.08f)})
        feed.addView(card,LinearLayout.LayoutParams(-1,-2).apply{setMargins(if(user)dp(42) else 0,dp(5),if(user)0 else dp(42),dp(5))});scroll.post{scroll.fullScroll(View.FOCUS_DOWN)}
    }

    private fun confirmClear(){AlertDialog.Builder(this).setTitle("پاک‌کردن گفتگو").setMessage("همهٔ پیام‌های ذخیره‌شده روی گوشی پاک شوند؟").setNegativeButton("انصراف",null).setPositiveButton("پاک‌کردن"){_,_->store.clear();feed.removeAllViews();status.text="گفتگو پاک شد."}.show()}

    private fun initTts(){
        tts=TextToSpeech(this){result->
            if(result==TextToSpeech.SUCCESS){
                val lang=tts?.setLanguage(Locale.forLanguageTag("fa-IR"))?:TextToSpeech.LANG_NOT_SUPPORTED
                voiceReady=lang!=TextToSpeech.LANG_MISSING_DATA&&lang!=TextToSpeech.LANG_NOT_SUPPORTED
                if(voiceReady)tts?.setSpeechRate(1.0f)
            }
            runOnUiThread{voice.isEnabled=voiceReady;if(!voiceReady)voice.text="صدای فارسی آماده نیست"}
        }
    }

    private fun recognize(){
        val i=Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply{
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL,RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);putExtra(RecognizerIntent.EXTRA_LANGUAGE,"fa-IR");putExtra(RecognizerIntent.EXTRA_PROMPT,"فارسی صحبت کن")
        }
        try{startActivityForResult(i,SPEECH_REQUEST)}catch(_:ActivityNotFoundException){Toast.makeText(this,"تشخیص گفتار روی گوشی پیدا نشد.",Toast.LENGTH_LONG).show()}
    }
    @Deprecated("compat")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){
        super.onActivityResult(requestCode,resultCode,data)
        if(requestCode==SPEECH_REQUEST&&resultCode==RESULT_OK&&data!=null){
            val r=data.getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS);if(!r.isNullOrEmpty()){draft.setText(r[0]);draft.setSelection(draft.length())}
        }
    }
    private fun speak(text:String){if(!voiceReady||!voice.isChecked)return;val e=tts?:return;if(text.length<=TextToSpeech.getMaxSpeechInputLength())e.speak(text,TextToSpeech.QUEUE_FLUSH,null,"hamhoosh-answer")}
    private fun friendlyError(t:Throwable):String{
        val r=t.message.orEmpty();return when{
            r.contains("Unable to resolve host",true)->"اینترنت برای دانلود مدل در دسترس نیست."
            r.contains("timeout",true)->"ارتباط بیش از حد طول کشید."
            r.contains("404")->"فایل مدل در منبع پیدا نشد."
            r.isNotBlank()->r.take(160)
            else->"خطای ناشناخته"
        }
    }
    override fun onDestroy(){chatJob?.cancel();downloadJob?.cancel();releaseCurrentModel();tts?.stop();tts?.shutdown();store.close();scope.cancel();super.onDestroy()}

    class Store(context:Context):SQLiteOpenHelper(context,"hamhoosh.db",null,1){
        override fun onCreate(db:SQLiteDatabase){db.execSQL("CREATE TABLE messages (id INTEGER PRIMARY KEY AUTOINCREMENT,role TEXT NOT NULL CHECK(role IN ('user','assistant')),body TEXT NOT NULL,created_at INTEGER NOT NULL)")}
        override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int)=Unit
        fun insert(role:String,body:String){writableDatabase.insertOrThrow("messages",null,ContentValues().apply{put("role",role);put("body",body);put("created_at",System.currentTimeMillis())})}
        fun clear(){writableDatabase.delete("messages",null,null)}
        fun readRecent(limit:Int):List<Pair<String,String>>{
            val out=ArrayList<Pair<String,String>>()
            val sql="SELECT role, body FROM (SELECT id, role, body FROM messages ORDER BY id DESC LIMIT ?) ORDER BY id"
            readableDatabase.rawQuery(sql,arrayOf(limit.toString())).use{c:Cursor->while(c.moveToNext())out.add(c.getString(0) to c.getString(1))}
            return out
        }
    }
}
