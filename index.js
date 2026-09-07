import express from 'express';
import OpenAI from 'openai';
import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';

const app = express();
const port = Number(process.env.PORT) || 10000;
const root = process.cwd();
const webDir = await fs.access(path.join(root, 'web')).then(() => path.join(root, 'web')).catch(() => root);

// ARIA uses OpenRouter's zero-cost model router for text by default.
// OpenAI is kept only as an optional legacy media provider; chat never depends on it.
const openRouterKey = process.env.OPENROUTER_API_KEY || process.env['Aria-openrouter-key'] || '';
const openRouter = openRouterKey ? new OpenAI({
  apiKey: openRouterKey,
  baseURL: 'https://openrouter.ai/api/v1'
}) : null;
const MODEL = process.env.ARIA_MODEL || 'openrouter/free';
const accessToken = process.env.ARIA_ACCESS_TOKEN || '';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '30mb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.get('/api/health', (_req, res) => res.json({
  ok: true,
  service: 'ARIA ULTIMATE',
  version: '3.0.0-free',
  provider: 'OpenRouter',
  model: MODEL,
  configured: Boolean(openRouterKey)
}));

app.use((req, res, next) => {
  if (accessToken && req.path !== '/api/health' && req.headers.authorization !== `Bearer ${accessToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use(express.static(webDir));
app.use('/generated', express.static(path.join(root, 'generated')));

app.post('/api/chat', async (req, res) => {
  try {
    if (!openRouter) return res.status(503).json({ error: 'OpenRouter API key is not configured.' });
    const body = req.body || {};
    const message = body.message || body.messages?.at(-1)?.content;
    const memory = typeof body.memory === 'string' ? body.memory : '';
    if (!message) return res.status(400).json({ error: 'message required' });

    const messages = [
      {
        role: 'system',
        content: 'You are ARIA, a capable Persian personal assistant. Reply in Persian when the user writes Persian. Be helpful and concise by default. Only assist cybersecurity work when it is authorized and defensive. Never claim to have performed an action unless it was actually performed.'
      },
      {
        role: 'user',
        content: `Memory:\n${memory.slice(-12000)}\n\nUser:\n${String(message)}`
      }
    ];

    const response = await openRouter.chat.completions.create({
      model: MODEL,
      messages
    });

    res.json({ text: response.choices?.[0]?.message?.content || '' });
  } catch (error) {
    const status = error?.status || 500;
    res.status(status).json({ error: error?.message || 'Chat failed' });
  }
});

// Optional media endpoint. Text chat remains free; image/video providers are configured separately.
async function saveDataUrl(data) {
  const match = String(data || '').match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('invalid image');
  const ext = (match[1].split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '') || 'png';
  const dir = path.join(root, 'generated');
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, `${crypto.randomUUID()}.${ext}`);
  await fs.writeFile(file, Buffer.from(match[2], 'base64'));
  return file;
}

async function mediaHandler(req, res) {
  try {
    const { prompt = '', mode = 'image', image } = req.body || {};
    if (!prompt && mode !== 'edit' && !image) return res.status(400).json({ error: 'prompt required' });

    if (mode === 'video' || mode === 'i2v') {
      if (!process.env.ARIA_VIDEO_ENDPOINT) return res.status(501).json({ error: 'Video provider is not configured.' });
      const response = await fetch(process.env.ARIA_VIDEO_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(process.env.ARIA_VIDEO_TOKEN ? { Authorization: `Bearer ${process.env.ARIA_VIDEO_TOKEN}` } : {}) },
        body: JSON.stringify({ prompt, mode, image })
      });
      const text = await response.text();
      let data;
      try { data = JSON.parse(text); } catch { data = { raw: text }; }
      return res.status(response.status).json(data);
    }

    return res.status(501).json({ error: 'Image generation is not connected to a free provider yet.' });
  } catch (error) {
    res.status(500).json({ error: error?.message || 'Media request failed' });
  }
}

app.post('/api/media', mediaHandler);
app.post('/api/image', mediaHandler);
app.post('/api/image-edit', mediaHandler);

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(webDir, 'index.html'));
  }
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, '0.0.0.0', () => console.log(`ARIA ULTIMATE listening on ${port}`));
