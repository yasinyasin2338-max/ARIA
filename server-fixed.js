import express from 'express';
import OpenAI from 'openai';
import { registerBridgeResults } from './bridge-results.js';
import { registerTts } from './tts.js';

const app = express();
const port = Number(process.env.PORT) || 10000;
const openRouterKey = process.env.OPENROUTER_API_KEY || process.env['Aria-openrouter-key'] || process.env['Aria-key'] || '';
const openAIKey = process.env.OPENAI_API_KEY || '';
const openAI = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;
const openRouter = openRouterKey ? new OpenAI({ apiKey: openRouterKey, baseURL: 'https://openrouter.ai/api/v1' }) : null;
const HORDE_OAI = 'https://oai.aihorde.net';
const HORDE_KEY = process.env.ARIA_HORDE_KEY || '0000000000';
const HORDE_AGENT = 'ARIA:2.1:https://github.com/yasinyasin2338-max/ARIA';
const SYSTEM = 'تو آریس هستی؛ دستیار فارسی صمیمی، روشن و کاربردی. وقتی کاربر فارسی می‌نویسد فارسی طبیعی و محاوره‌ای جواب بده. کوتاه و دقیق باش، بی‌دلیل تکرار نکن و هرگز ادعا نکن کاری انجام شده مگر واقعاً انجام شده باشد.';

app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'ARIA ULTIMATE',
  version: '8.0-direct-bridge',
  provider: openAI ? 'OpenAI' : openRouter ? 'OpenRouter+AI Horde fallback' : 'AI Horde',
  capabilities: {
    chat: true,
    neuralPersianTts: true,
    androidDirectBridge: true,
    accessibilityControl: true,
    voiceInput: true,
    voiceOutput: true
  }
}));

registerBridgeResults(app);
registerTts(app);

async function chatOpenAI(message) {
  if (!openAI) return null;
  try {
    const r = await openAI.responses.create({
      model: process.env.ARIA_MODEL || 'gpt-5.6',
      instructions: SYSTEM,
      input: message
    });
    return String(r.output_text || '').trim() || null;
  } catch (e) {
    console.error('OpenAI chat failed:', e?.message || e);
    return null;
  }
}

async function chatOpenRouter(message) {
  if (!openRouter) return null;
  try {
    const r = await openRouter.chat.completions.create({
      model: process.env.ARIA_OPENROUTER_MODEL || 'openrouter/free',
      messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: message }
      ]
    });
    return String(r.choices?.[0]?.message?.content || '').trim() || null;
  } catch (e) {
    console.error('OpenRouter chat failed:', e?.message || e);
    return null;
  }
}

async function chatHorde(message) {
  try {
    const modelsResp = await fetch(`${HORDE_OAI}/v1/models`, {
      headers: { apikey: HORDE_KEY, 'Client-Agent': HORDE_AGENT }
    });
    if (!modelsResp.ok) return null;
    const models = await modelsResp.json();
    const model = models?.data?.[0]?.id || 'default';
    const r = await fetch(`${HORDE_OAI}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: HORDE_KEY,
        'Client-Agent': HORDE_AGENT
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: message }
        ]
      })
    });
    if (!r.ok) return null;
    const j = await r.json();
    return String(j?.choices?.[0]?.message?.content || '').trim() || null;
  } catch (e) {
    console.error('AI Horde chat failed:', e?.message || e);
    return null;
  }
}

app.post('/api/chat', async (req, res) => {
  const message = String(req.body?.message || '').trim().slice(0, 12000);
  if (!message) return res.status(400).json({ error: 'message required' });
  const text = await chatOpenAI(message) || await chatOpenRouter(message) || await chatHorde(message);
  if (!text) return res.status(200).json({
    text: 'الان پاسخ‌گویی آنلاین موقتاً در دسترس نیست؛ دوباره صدام کن.',
    provider: 'fallback'
  });
  return res.json({ text, provider: openAI ? 'OpenAI' : openRouter ? 'OpenRouter/AI Horde' : 'AI Horde' });
});

app.get('/api/capabilities', (_req, res) => res.json({
  chat: true,
  neuralPersianTts: true,
  androidDirectBridge: true,
  accessibilityControl: true,
  backgroundVoice: true
}));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));

app.listen(port, '0.0.0.0', () => {
  console.log(`ARIA stable runtime listening on ${port}`);
});
