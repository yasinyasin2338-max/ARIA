import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import OpenAI from 'openai';

const app = express();
app.use(cors());
app.use(express.json({limit:'2mb'}));
const client = new OpenAI({apiKey: process.env.OPENAI_API_KEY});
const model = process.env.OPENAI_MODEL || 'gpt-5';

const ARIA = `You are ARIA, a highly capable Persian-first personal AI assistant and companion. Be warm, direct, intelligent, practical and fast. Speak naturally in Persian when the user speaks Persian. Help with writing, coding, planning, analysis, learning, files, ideas and everyday tasks. Never claim you can bypass platform, legal, privacy or safety controls. When a request needs unavailable device permissions or tools, clearly say so and offer the closest safe implementation. Do not pretend to have taken actions you did not take. Preserve useful conversational context supplied by the client.`;

app.get('/health', (_,res)=>res.json({ok:true, service:'ARIA'}));
app.post('/v1/chat', async (req,res)=>{
  try {
    const {messages=[], memory=[]} = req.body || {};
    const safeMessages = Array.isArray(messages) ? messages.slice(-40).map(m=>({role:m.role==='assistant'?'assistant':'user',content:String(m.content||'').slice(0,12000)})) : [];
    const memoryText = Array.isArray(memory) && memory.length ? `\nUser-approved memory:\n${memory.slice(0,50).map(x=>'- '+String(x).slice(0,1000)).join('\n')}` : '';
    const input = safeMessages.map(m=>`${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
    const response = await client.responses.create({model, instructions: ARIA + memoryText, input});
    res.json({reply: response.output_text || 'پاسخی دریافت نشد.'});
  } catch (e) {
    console.error(e);
    res.status(500).json({error:'خطا در اتصال به موتور هوش مصنوعی. تنظیمات سرور و کلید API را بررسی کن.'});
  }
});
app.listen(process.env.PORT||8787, ()=>console.log(`ARIA server on ${process.env.PORT||8787}`));
