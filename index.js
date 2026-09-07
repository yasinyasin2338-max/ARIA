import express from 'express';
import OpenAI from 'openai';
import fs from 'node:fs/promises';
import path from 'node:path';

const app = express();
const port = Number(process.env.PORT) || 10000;
const root = process.cwd();
const webDir = await fs.access(path.join(root, 'web')).then(() => path.join(root, 'web')).catch(() => root);

const openAIKey = process.env.OPENAI_API_KEY || '';
const openRouterKey = process.env.OPENROUTER_API_KEY || process.env['Aria-openrouter-key'] || process.env['Aria-key'] || '';
const openAI = openAIKey ? new OpenAI({ apiKey: openAIKey }) : null;
const openRouter = openRouterKey ? new OpenAI({ apiKey: openRouterKey, baseURL: 'https://openrouter.ai/api/v1' }) : null;
const MODEL = process.env.ARIA_MODEL || (openAI ? 'gpt-6-astra' : 'openrouter/free');
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
  version: '4.0.0',
  provider: openAI ? 'OpenAI' : 'OpenRouter',
  model: MODEL,
  configured: Boolean(openAI || openRouter),
  capabilities: ['chat', 'voice-ui', 'pwa', 'memory', 'image-input', 'agent-ready']
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
    if (!openAI && !openRouter) return res.status(503).json({ error: 'No AI provider is configured.' });
    const body = req.body || {};
    const message = body.message || body.messages?.at(-1)?.content;
    const memory = typeof body.memory === 'string' ? body.memory : '';
    if (!message) return res.status(400).json({ error: 'message required' });
    const system = 'You are ARIA, a highly capable Persian personal AI assistant. Reply in Persian when the user writes Persian. Be concise by default. Use available tools only when actually connected. Never claim an action was completed unless it was actually completed. Cybersecurity assistance must stay within authorized, defensive work.';
    let text = '';
    if (openAI) {
      const response = await openAI.responses.create({
        model: MODEL,
        reasoning: { effort: process.env.ARIA_REASONING || 'medium' },
        instructions: system,
        input: `Memory:\n${memory.slice(-12000)}\n\nUser:\n${String(message)}`
      });
      text = response.output_text || '';
    } else {
      const response = await openRouter.chat.completions.create({
        model: MODEL,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: `Memory:\n${memory.slice(-12000)}\n\nUser:\n${String(message)}` }
        ]
      });
      text = response.choices?.[0]?.message?.content || '';
    }
    res.json({ text, model: MODEL, provider: openAI ? 'OpenAI' : 'OpenRouter' });
  } catch (error) {
    const status = error?.status || 500;
    res.status(status).json({ error: error?.message || 'Chat failed' });
  }
});

app.post('/api/media', async (req, res) => {
  const { prompt = '', mode = 'image', image } = req.body || {};
  if (!prompt && !image) return res.status(400).json({ error: 'prompt required' });
  if ((mode === 'video' || mode === 'i2v') && !process.env.ARIA_VIDEO_ENDPOINT) return res.status(501).json({ error: 'Video provider is not configured.' });
  if ((mode === 'image' || mode === 'edit') && !process.env.ARIA_IMAGE_ENDPOINT) return res.status(501).json({ error: 'Image provider is not configured.' });
  const endpoint = mode === 'video' || mode === 'i2v' ? process.env.ARIA_VIDEO_ENDPOINT : process.env.ARIA_IMAGE_ENDPOINT;
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(process.env.ARIA_MEDIA_TOKEN ? { Authorization: `Bearer ${process.env.ARIA_MEDIA_TOKEN}` } : {}) },
      body: JSON.stringify({ prompt, mode, image })
    });
    const raw = await response.text();
    let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
    res.status(response.status).json(data);
  } catch (error) { res.status(500).json({ error: error?.message || 'Media request failed' }); }
});
app.post('/api/image', (req, res) => { req.body = { ...(req.body || {}), mode: 'image' }; return app._router?.handle(req, res); });
app.post('/api/image-edit', (req, res) => { req.body = { ...(req.body || {}), mode: 'edit' }; return app._router?.handle(req, res); });

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(webDir, 'index.html'));
  res.status(404).json({ error: 'Not found' });
});
app.listen(port, '0.0.0.0', () => console.log(`ARIA ULTIMATE listening on ${port}`));
