import express from 'express';
import OpenAI, { toFile } from 'openai';
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
const IMAGE_MODEL = process.env.ARIA_IMAGE_MODEL || 'gpt-image-2';
const accessToken = process.env.ARIA_ACCESS_TOKEN || '';
const enableWeb = process.env.ARIA_WEB_SEARCH !== 'false';

app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '50mb' }));
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
  version: '5.0.0',
  provider: openAI ? 'OpenAI' : openRouter ? 'OpenRouter' : 'none',
  model: MODEL,
  configured: Boolean(openAI || openRouter),
  capabilities: {
    chat: Boolean(openAI || openRouter),
    webSearch: Boolean(openAI && enableWeb),
    imageGeneration: Boolean(openAI),
    imageEditing: Boolean(openAI),
    voice: Boolean(openAI),
    persistentDeviceMemory: true,
    videoProvider: Boolean(process.env.ARIA_VIDEO_ENDPOINT)
  }
}));

app.use((req, res, next) => {
  if (accessToken && req.path !== '/api/health' && req.headers.authorization !== `Bearer ${accessToken}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
});

app.use(express.static(webDir));
app.use('/generated', express.static(path.join(root, 'generated')));

const SYSTEM = `You are ARIA, a highly capable Persian personal AI assistant. Reply in Persian when the user writes Persian. Be concise by default but complete when needed. You are an agent: use connected tools when available and never claim an action happened unless it actually happened. Explain tool limitations honestly. Cybersecurity assistance must remain authorized and defensive.`;

function textFromResponse(response) {
  return response?.output_text || response?.output?.filter(x => x.type === 'message').flatMap(x => x.content || []).filter(x => x.type === 'output_text').map(x => x.text).join('\n') || '';
}

async function runOpenAI({ message, memory = '', image = null, web = true }) {
  const content = [{ type: 'input_text', text: `Memory:\n${String(memory).slice(-20000)}\n\nUser:\n${String(message)}` }];
  if (image) content.push({ type: 'input_image', image_url: image });
  const params = {
    model: MODEL,
    reasoning: { effort: process.env.ARIA_REASONING || 'medium' },
    instructions: SYSTEM,
    input: [{ role: 'user', content }]
  };
  if (web && enableWeb) params.tools = [{ type: 'web_search_preview' }];
  return openAI.responses.create(params);
}

app.post('/api/chat', async (req, res) => {
  try {
    if (!openAI && !openRouter) return res.status(503).json({ error: 'No AI provider is configured.' });
    const body = req.body || {};
    const message = body.message || body.messages?.at(-1)?.content;
    if (!message) return res.status(400).json({ error: 'message required' });
    let text = '';
    let sources = [];
    if (openAI) {
      const response = await runOpenAI({ message, memory: body.memory, image: body.image, web: body.web !== false });
      text = textFromResponse(response);
      sources = response.output?.filter(x => x.type === 'web_search_call').flatMap(x => x.action?.sources || []) || [];
    } else {
      const response = await openRouter.chat.completions.create({ model: MODEL, messages: [
        { role: 'system', content: SYSTEM },
        { role: 'user', content: `Memory:\n${String(body.memory || '').slice(-12000)}\n\nUser:\n${String(message)}` }
      ] });
      text = response.choices?.[0]?.message?.content || '';
    }
    res.json({ text, model: MODEL, provider: openAI ? 'OpenAI' : 'OpenRouter', sources });
  } catch (error) {
    res.status(error?.status || 500).json({ error: error?.message || 'Chat failed' });
  }
});

app.post('/api/image', async (req, res) => {
  if (!openAI) return res.status(501).json({ error: 'OpenAI image generation requires OPENAI_API_KEY.' });
  const { prompt = '', size = '1024x1024', quality = 'high' } = req.body || {};
  if (!prompt) return res.status(400).json({ error: 'prompt required' });
  try {
    const result = await openAI.images.generate({ model: IMAGE_MODEL, prompt, size, quality });
    const item = result.data?.[0];
    res.json({ image: item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url || null, revised_prompt: item?.revised_prompt || '' });
  } catch (error) { res.status(error?.status || 500).json({ error: error?.message || 'Image generation failed' }); }
});

app.post('/api/image-edit', async (req, res) => {
  if (!openAI) return res.status(501).json({ error: 'OpenAI image editing requires OPENAI_API_KEY.' });
  const { prompt = '', image } = req.body || {};
  if (!prompt || !image) return res.status(400).json({ error: 'prompt and image required' });
  try {
    const match = String(image).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'image must be a base64 data URL' });
    const file = await toFile(Buffer.from(match[2], 'base64'), 'input.png', { type: match[1] });
    const result = await openAI.images.edit({ model: IMAGE_MODEL, image: file, prompt });
    const item = result.data?.[0];
    res.json({ image: item?.b64_json ? `data:image/png;base64,${item.b64_json}` : item?.url || null, revised_prompt: item?.revised_prompt || '' });
  } catch (error) { res.status(error?.status || 500).json({ error: error?.message || 'Image edit failed' }); }
});

app.post('/api/tts', async (req, res) => {
  if (!openAI) return res.status(501).json({ error: 'OpenAI voice requires OPENAI_API_KEY.' });
  const { text = '', voice = 'alloy' } = req.body || {};
  if (!text) return res.status(400).json({ error: 'text required' });
  try {
    const speech = await openAI.audio.speech.create({ model: process.env.ARIA_TTS_MODEL || 'gpt-4o-mini-tts', voice, input: String(text), response_format: 'mp3' });
    const buffer = Buffer.from(await speech.arrayBuffer());
    res.json({ audio: `data:audio/mpeg;base64,${buffer.toString('base64')}` });
  } catch (error) { res.status(error?.status || 500).json({ error: error?.message || 'TTS failed' }); }
});

app.post('/api/transcribe', async (req, res) => {
  if (!openAI) return res.status(501).json({ error: 'OpenAI transcription requires OPENAI_API_KEY.' });
  const { audio } = req.body || {};
  if (!audio) return res.status(400).json({ error: 'audio required' });
  try {
    const match = String(audio).match(/^data:([^;]+);base64,(.+)$/);
    if (!match) return res.status(400).json({ error: 'audio must be a base64 data URL' });
    const file = await toFile(Buffer.from(match[2], 'base64'), 'audio.webm', { type: match[1] });
    const transcript = await openAI.audio.transcriptions.create({ file, model: process.env.ARIA_TRANSCRIBE_MODEL || 'gpt-4o-mini-transcribe', language: 'fa' });
    res.json({ text: transcript.text || '' });
  } catch (error) { res.status(error?.status || 500).json({ error: error?.message || 'Transcription failed' }); }
});

app.post('/api/media', async (req, res) => {
  const { prompt = '', mode = 'video', image } = req.body || {};
  const endpoint = process.env.ARIA_VIDEO_ENDPOINT;
  if (!endpoint) return res.status(501).json({ error: 'Video provider is not configured yet.' });
  if (!prompt && !image) return res.status(400).json({ error: 'prompt or image required' });
  try {
    const r = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.ARIA_MEDIA_TOKEN ? { Authorization: `Bearer ${process.env.ARIA_MEDIA_TOKEN}` } : {}) }, body: JSON.stringify({ prompt, mode, image }) });
    const raw = await r.text(); let data; try { data = JSON.parse(raw); } catch { data = { raw }; }
    res.status(r.status).json(data);
  } catch (error) { res.status(500).json({ error: error?.message || 'Video request failed' }); }
});

app.get('/api/capabilities', (_req, res) => res.json({
  chat: true, webSearch: Boolean(openAI && enableWeb), imageGeneration: Boolean(openAI), imageEditing: Boolean(openAI), voiceInput: Boolean(openAI), voiceOutput: Boolean(openAI), video: Boolean(process.env.ARIA_VIDEO_ENDPOINT), memory: true, android: true
}));

app.use((req, res) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) return res.sendFile(path.join(webDir, 'index.html'));
  res.status(404).json({ error: 'Not found' });
});

app.listen(port, '0.0.0.0', () => console.log(`ARIA ULTIMATE listening on ${port}`));
