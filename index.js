import express from 'express';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const app=express();
app.set('trust proxy', 1);
app.use(express.json({limit:'30mb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);next()});
const port=process.env.PORT||10000;const client=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
const MODEL=process.env.ARIA_MODEL||'gpt-5';const IMAGE=process.env.ARIA_IMAGE_MODEL||'gpt-image-1';
const token=process.env.ARIA_ACCESS_TOKEN||'';
app.use((req,res,next)=>{if(token&&req.path!='/api/health'&&req.headers.authorization!==`Bearer ${token}`)return res.status(401).json({error:'Unauthorized'});res.setHeader('X-Content-Type-Options','nosniff');next()});
app.use(express.static(path.join(process.cwd(),'web')));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'ARIA ULTIMATE',version:'2.1.0',model:MODEL,image:IMAGE}));
app.post('/api/chat',async(req,res)=>{try{const {message,memory='',web=false}=req.body||{};if(!message)return res.status(400).json({error:'message required'});const tools=(web&&process.env.ARIA_WEB_SEARCH!=='false')?[{type:'web_search_preview'}]:undefined;const r=await client.responses.create({model:MODEL,instructions:'You are ARIA, a capable Persian personal assistant. Be helpful, concise by default, and only assist cybersecurity work when it is authorized and defensive. Do not claim to have performed real-world actions you did not perform.',input:`Memory:\n${memory.slice(-12000)}\n\nUser:\n${message}`,tools});res.json({text:r.output_text||''})}catch(e){res.status(500).json({error:e.message})}});
async function saveDataUrl(data){const m=String(data||'').match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('invalid image');const ext=(m[1].split('/')[1]||'png').replace(/[^a-z0-9]/gi,'');const dir=path.join(process.cwd(),'generated');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`${crypto.randomUUID()}.${ext}`);await fs.writeFile(file,Buffer.from(m[2],'base64'));return file}
app.use('/generated',express.static(path.join(process.cwd(),'generated')));
app.post('/api/media',async(req,res)=>{try{const {prompt='',mode='image',image}=req.body||{};if(!prompt&&mode!=='edit')return res.status(400).json({error:'prompt required'});
 if(mode==='video'||mode==='i2v'){if(!process.env.ARIA_VIDEO_ENDPOINT)return res.json({message:'درخواست ویدیو آماده است؛ برای رندر واقعی باید یک سرویس ویدیوی سازگار در ARIA_VIDEO_ENDPOINT متصل شود.'});const payload={prompt,mode,image};const rr=await fetch(process.env.ARIA_VIDEO_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.ARIA_VIDEO_TOKEN||''}`},body:JSON.stringify(payload)});const data=await rr.json();return res.status(rr.status).json(data)}
 if(mode==='edit'||image){const file=await saveDataUrl(image);const result=await client.images.edit({model:IMAGE,image:await import('node:fs').then(m=>m.createReadStream(file)),prompt,size:'1024x1024',n:1});const b64=result.data?.[0]?.b64_json;if(!b64)return res.json({message:'ویرایش انجام شد، اما خروجی URL نداشت.'});const dir=path.join(process.cwd(),'generated');await fs.mkdir(dir,{recursive:true});const out=`${crypto.randomUUID()}.png`;await fs.writeFile(path.join(dir,out),Buffer.from(b64,'base64'));return res.json({kind:'image',url:`/generated/${out}`})}
 const result=await client.images.generate({model:IMAGE,prompt,size:'1024x1024',n:1});const b64=result.data?.[0]?.b64_json;if(!b64)return res.json({message:'تصویر ساخته شد، اما خروجی قابل نمایش نبود.'});const dir=path.join(process.cwd(),'generated');await fs.mkdir(dir,{recursive:true});const out=`${crypto.randomUUID()}.png`;await fs.writeFile(path.join(dir,out),Buffer.from(b64,'base64'));res.json({kind:'image',url:`/generated/${out}`})
 }catch(e){res.status(500).json({error:e.message})}});
app.get('/*splat',(req,res)=>res.sendFile(path.join(process.cwd(),'web','index.html')));
app.listen(port,'0.0.0.0',()=>console.log(`ARIA ULTIMATE on ${port}`));
