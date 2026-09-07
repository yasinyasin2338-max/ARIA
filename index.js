import express from 'express';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';

const app=express();
const port=Number(process.env.PORT)||10000;
const root=process.cwd();
const webDir=await fs.access(path.join(root,'web')).then(()=>path.join(root,'web')).catch(()=>root);
const openRouterKey=process.env.OPENROUTER_API_KEY||process.env['Aria-openrouter-key']||process.env['Aria-key']||'';
const openAIKey=process.env.OPENAI_API_KEY||'';
const openAI=openAIKey?new OpenAI({apiKey:openAIKey}):null;
const openRouter=openRouterKey?new OpenAI({apiKey:openRouterKey,baseURL:'https://openrouter.ai/api/v1'}):null;
const accessToken=process.env.ARIA_ACCESS_TOKEN||'';
const HORDE='https://aihorde.net/api/v2';
const HORDE_KEY=process.env.ARIA_HORDE_KEY||'0000000000';
const HORDE_AGENT='ARIA:1.0:https://github.com/yasinyasin2338-max/ARIA';
const SYSTEM=`You are ARIA, a highly capable Persian personal AI assistant. Reply in Persian when the user writes Persian. Be concise by default. Use supplied web context when present and distinguish facts from uncertainty. Never claim an action happened if it did not. Cybersecurity help is limited to authorized or defensive work.`;
app.disable('x-powered-by');app.use(express.json({limit:'50mb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
app.get('/api/health',(_q,res)=>res.json({ok:true,service:'ARIA ULTIMATE',version:'7.0-free',provider:openAI?'OpenAI':openRouter?'OpenRouter+AI Horde':'AI Horde',freeMode:!openAI,capabilities:{chat:true,webSearch:true,imageGeneration:true,imageEditing:true,voiceInput:true,voiceOutput:true,video:Boolean(process.env.ARIA_VIDEO_ENDPOINT),memory:true,android:true}}));
app.use((req,res,next)=>{if(accessToken&&req.path!='/api/health'&&req.headers.authorization!==`Bearer ${accessToken}`)return res.status(401).json({error:'Unauthorized'});next()});
app.use(express.static(webDir));
app.use('/generated',express.static(path.join(root,'generated')));

async function webSearch(q){
  const query=encodeURIComponent(q);
  const out=[];
  try{const r=await fetch(`https://www.google.com/search?q=${query}&hl=en`,{headers:{'User-Agent':'Mozilla/5.0'}});const h=await r.text();const re=/<a href="\/url\\?q=(https?:[^&"]+)[^>]*>(.*?)<\\/a>/g;let m;while((m=re.exec(h))&&out.length<6){const u=decodeURIComponent(m[1]);const t=m[2].replace(/<[^>]+>/g,'').trim();if(t&&!u.includes('google.com'))out.push({title:t,url:u})}}catch{}
  if(!out.length)try{const r=await fetch(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${query}&format=json&origin=*`);const j=await r.json();for(const x of j.query?.search||[])out.push({title:x.title,url:`https://en.wikipedia.org/wiki/${encodeURIComponent(x.title.replaceAll(' ','_'))}`,snippet:x.snippet?.replace(/<[^>]+>/g,'')})}catch{}
  return out;
}
function needsSearch(s){return /\b(امروز|الان|آخرین|اخبار|قیمت|هوا|جستجو|پیدا کن|اطلاعات درباره|کیست|چیست|where|latest|today|news|price)\b/i.test(s)}
function safeCalc(s){const x=s.replace(/[۰-۹]/g,c=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(c)).replace(/,/g,'').trim();if(!/^[0-9+*/().%\-\s]+$/.test(x)||!/[+*/%\-]/.test(x))return null;try{const v=Function(`"use strict";return (${x})`)();return Number.isFinite(v)?String(v):null}catch{return null}}
async function chatFree(message,memory,web){
  const calc=safeCalc(message);if(calc)return `نتیجه: ${calc}`;
  const sources=web||needsSearch(message)?await webSearch(message):[];
  const context=sources.length?`\n\nWeb context:\n${sources.map((x,i)=>`${i+1}. ${x.title} — ${x.url}${x.snippet?` — ${x.snippet}`:''}`).join('\n')}`:'';
  if(openAI){const r=await openAI.responses.create({model:process.env.ARIA_MODEL||'gpt-6-astra',instructions:SYSTEM,input:[{role:'user',content:`Memory:\n${String(memory||'').slice(-16000)}\n\nUser:\n${message}${context}`} ]});return {text:r.output_text||'',sources}}
  if(openRouter){const r=await openRouter.chat.completions.create({model:'openrouter/free',messages:[{role:'system',content:SYSTEM},{role:'user',content:`Memory:\n${String(memory||'').slice(-16000)}\n\nUser:\n${message}${context}`} ]});return {text:r.choices?.[0]?.message?.content||'',sources}}
  try{const models=await fetch('https://oai.aihorde.net/v1/models',{headers:{apikey:HORDE_KEY,'Client-Agent':HORDE_AGENT}}).then(r=>r.json());const model=models.data?.[0]?.id||'default';const r=await fetch('https://oai.aihorde.net/v1/chat/completions',{method:'POST',headers:{'Content-Type':'application/json',apikey:HORDE_KEY,'Client-Agent':HORDE_AGENT},body:JSON.stringify({model,messages:[{role:'system',content:SYSTEM},{role:'user',content:`Memory:\n${String(memory||'').slice(-12000)}\n\nUser:\n${message}${context}`} ]})});const j=await r.json();return {text:j.choices?.[0]?.message?.content||'در حال حاضر مدل رایگان صف دارد.',sources}}catch{return {text:'مدل رایگان فعلاً در دسترس نیست؛ چند لحظه بعد دوباره امتحان کن.',sources}}
}
app.post('/api/chat',async(req,res)=>{try{const b=req.body||{};if(!b.message)return res.status(400).json({error:'message required'});const r=await chatFree(b.message,b.memory,b.web===true);res.json({...r,provider:openAI?'OpenAI':openRouter?'OpenRouter':'AI Horde',freeMode:true})}catch(e){res.status(500).json({error:e.message||'Chat failed'})}});

async function hordeImage(prompt,sourceImage=null){
 const payload={apikey:HORDE_KEY,client_agent:HORDE_AGENT,prompt,models:['stable_diffusion'],nsfw:false,censor_nsfw:true,params:{width:768,height:768,steps:20,n:1,cfg_scale:7}};
 if(sourceImage){payload.source_image=sourceImage.replace(/^data:[^;]+;base64,/,'');payload.source_processing='img2img';payload.params.denoising_strength=0.55}
 const r=await fetch(`${HORDE}/generate/async`,{method:'POST',headers:{'Content-Type':'application/json',apikey:HORDE_KEY,'Client-Agent':HORDE_AGENT},body:JSON.stringify(payload)});const j=await r.json();if(!r.ok)throw new Error(j.message||'AI Horde rejected request');
 const id=j.id;const until=Date.now()+150000;while(Date.now()<until){await new Promise(x=>setTimeout(x,2500));const s=await fetch(`${HORDE}/generate/status/${id}`,{headers:{apikey:HORDE_KEY,'Client-Agent':HORDE_AGENT}}).then(x=>x.json());if(s.done&&s.generations?.length){const g=s.generations[0];return g.img?.startsWith('http')?g.img:`data:image/webp;base64,${g.img}`}}throw new Error('generation timed out')}
app.post('/api/image',async(req,res)=>{try{const p=String(req.body?.prompt||'').trim();if(!p)return res.status(400).json({error:'prompt required'});if(openAI){const r=await openAI.images.generate({model:process.env.ARIA_IMAGE_MODEL||'gpt-image-2',prompt:p,size:req.body?.size||'1024x1024',quality:req.body?.quality||'high'});const i=r.data?.[0];return res.json({image:i?.b64_json?`data:image/png;base64,${i.b64_json}`:i?.url})}const image=await hordeImage(p);res.json({image,provider:'AI Horde free'})}catch(e){res.status(500).json({error:e.message||'Image generation failed'})}});
app.post('/api/image-edit',async(req,res)=>{try{const p=String(req.body?.prompt||'').trim(),img=req.body?.image;if(!p||!img)return res.status(400).json({error:'prompt and image required'});if(openAI){const {toFile}=await import('openai');const m=String(img).match(/^data:([^;]+);base64,(.+)$/);const f=await toFile(Buffer.from(m[2],'base64'),'input.png',{type:m[1]});const r=await openAI.images.edit({model:process.env.ARIA_IMAGE_MODEL||'gpt-image-2',image:f,prompt:p});const i=r.data?.[0];return res.json({image:i?.b64_json?`data:image/png;base64,${i.b64_json}`:i?.url})}const image=await hordeImage(p,img);res.json({image,provider:'AI Horde free img2img'})}catch(e){res.status(500).json({error:e.message||'Image edit failed'})}});
app.post('/api/tts',async(req,res)=>res.status(501).json({error:'Free mode uses Android/browser Persian TTS.'}));
app.post('/api/transcribe',async(req,res)=>res.status(501).json({error:'Free mode uses on-device Android speech recognition.'}));
app.post('/api/media',async(req,res)=>{const endpoint=process.env.ARIA_VIDEO_ENDPOINT;if(!endpoint)return res.status(501).json({error:'Free video generation provider is not connected.'});try{const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(req.body||{})});res.status(r.status).send(await r.text())}catch(e){res.status(500).json({error:e.message})}});
app.get('/api/capabilities',(_q,res)=>res.json({chat:true,webSearch:true,imageGeneration:true,imageEditing:true,voiceInput:true,voiceOutput:true,video:Boolean(process.env.ARIA_VIDEO_ENDPOINT),memory:true,android:true,backgroundVoice:true,freeMode:true}));
app.use((req,res)=>req.method==='GET'&&!req.path.startsWith('/api/')?res.sendFile(path.join(webDir,'index.html')):res.status(404).json({error:'Not found'}));
app.listen(port,'0.0.0.0',()=>console.log(`ARIA free-first listening on ${port}`));
