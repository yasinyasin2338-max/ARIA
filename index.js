import express from 'express';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const app=express();
app.set('trust proxy',1);
app.use(express.json({limit:'30mb'}));
app.use((req,res,next)=>{res.setHeader('Access-Control-Allow-Origin','*');res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');res.setHeader('Access-Control-Allow-Methods','GET,POST,OPTIONS');if(req.method==='OPTIONS')return res.sendStatus(204);res.setHeader('X-Content-Type-Options','nosniff');next()});
const port=process.env.PORT||10000;
const apiKey=process.env.OPENAI_API_KEY||process.env['Aria-key']||'';
const client=apiKey?new OpenAI({apiKey}):null;
const MODEL=process.env.ARIA_MODEL||'gpt-5';
const IMAGE=process.env.ARIA_IMAGE_MODEL||'gpt-image-1';
const token=process.env.ARIA_ACCESS_TOKEN||'';
const root=process.cwd();
const webDir=(await fs.access(path.join(root,'web')).then(()=>true).catch(()=>false))?path.join(root,'web'):root;
app.use(express.static(webDir));
app.get('/api/health',(req,res)=>res.json({ok:true,service:'ARIA ULTIMATE',version:'2.2.0',model:MODEL,image:IMAGE,configured:Boolean(apiKey)}));
app.use((req,res,next)=>{if(token&&req.path!='/api/health'&&req.headers.authorization!==`Bearer ${token}`)return res.status(401).json({error:'Unauthorized'});next()});
app.post('/api/chat',async(req,res)=>{try{if(!client)return res.status(503).json({error:'OpenAI API key is not configured.'});const body=req.body||{};const message=body.message||body.messages?.at(-1)?.content;const memory=typeof body.memory==='string'?body.memory:'';const useWeb=Boolean(body.web||body.webSearch);if(!message)return res.status(400).json({error:'message required'});const tools=useWeb&&process.env.ARIA_WEB_SEARCH!=='false'?[{type:'web_search_preview'}]:undefined;const r=await client.responses.create({model:MODEL,instructions:'You are ARIA, a capable Persian personal assistant. Be helpful and concise by default. Only assist cybersecurity work when it is authorized and defensive. Do not claim to have performed real-world actions you did not perform.',input:`Memory:\n${memory.slice(-12000)}\n\nUser:\n${message}`,tools});res.json({text:r.output_text||''})}catch(e){res.status(500).json({error:e?.message||'Chat failed'})}});
async function saveDataUrl(data){const m=String(data||'').match(/^data:([^;]+);base64,(.+)$/);if(!m)throw new Error('invalid image');const ext=(m[1].split('/')[1]||'png').replace(/[^a-z0-9]/gi,'')||'png';const dir=path.join(root,'generated');await fs.mkdir(dir,{recursive:true});const file=path.join(dir,`${crypto.randomUUID()}.${ext}`);await fs.writeFile(file,Buffer.from(m[2],'base64'));return file}
app.use('/generated',express.static(path.join(root,'generated')));
async function mediaHandler(req,res){try{if(!client)return res.status(503).json({error:'OpenAI API key is not configured.'});const {prompt='',mode='image',image,size='1024x1024'}=req.body||{};if(!prompt&&mode!=='edit')return res.status(400).json({error:'prompt required'});if(mode==='video'||mode==='i2v'){if(!process.env.ARIA_VIDEO_ENDPOINT)return res.status(501).json({error:'Video provider is not configured.'});const rr=await fetch(process.env.ARIA_VIDEO_ENDPOINT,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.ARIA_VIDEO_TOKEN||''}`},body:JSON.stringify({prompt,mode,image})});return res.status(rr.status).json(await rr.json())}if(mode==='edit'||image){const file=await saveDataUrl(image);const result=await client.images.edit({model:IMAGE,image:await import('node:fs').then(m=>m.createReadStream(file)),prompt,size,n:1});const b64=result.data?.[0]?.b64_json;if(!b64)throw new Error('No image output');const dir=path.join(root,'generated');await fs.mkdir(dir,{recursive:true});const out=`${crypto.randomUUID()}.png`;await fs.writeFile(path.join(dir,out),Buffer.from(b64,'base64'));return res.json({kind:'image',url:`/generated/${out}`,image:`/generated/${out}`})}const result=await client.images.generate({model:IMAGE,prompt,size,n:1});const b64=result.data?.[0]?.b64_json;if(!b64)throw new Error('No image output');const dir=path.join(root,'generated');await fs.mkdir(dir,{recursive:true});const out=`${crypto.randomUUID()}.png`;await fs.writeFile(path.join(dir,out),Buffer.from(b64,'base64'));res.json({kind:'image',url:`/generated/${out}`,image:`/generated/${out}`})}catch(e){res.status(500).json({error:e?.message||'Media request failed'})}}
app.post('/api/media',mediaHandler);app.post('/api/image',mediaHandler);app.post('/api/image-edit',mediaHandler);
app.get('/*splat',(req,res)=>res.sendFile(path.join(webDir,'index.html')));
app.listen(port,'0.0.0.0',()=>console.log(`ARIA ULTIMATE on ${port}`));