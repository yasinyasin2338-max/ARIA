import { generateSpeech } from '@bestcodes/edge-tts/dist/index.mjs';

const POCKET_TTS_URL = process.env.ARIA_PERSIAN_TTS_URL || 'https://aria-v4-production.up.railway.app/tts';
const VOICES = {
  male: 'fa-IR-FaridNeural',
  female: 'fa-IR-DilaraNeural'
};

function cleanSpeechText(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[`*_#>|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1800);
}

async function pocketSpeech(text, requested) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 90_000);
  try {
    const r = await fetch(POCKET_TTS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'audio/*',
        'User-Agent': 'ARIA-Server-TTS-Proxy/1.0'
      },
      body: JSON.stringify({ text, voice: requested }),
      signal: controller.signal
    });
    if (!r.ok) throw new Error(`Pocket TTS HTTP ${r.status}`);
    const type = String(r.headers.get('content-type') || '').toLowerCase();
    if (!type.startsWith('audio/')) throw new Error(`Pocket TTS invalid content-type ${type}`);
    const bytes = Buffer.from(await r.arrayBuffer());
    if (bytes.length < 256) throw new Error('Pocket TTS returned empty audio');
    return { bytes, type, engine: 'pocket-tts-farsi' };
  } finally {
    clearTimeout(timeout);
  }
}

async function edgeSpeech(text, requested, rate, pitch) {
  const voice = requested === 'female' || requested.includes('dilara') ? VOICES.female : VOICES.male;
  const audio = await generateSpeech({
    text,
    voice,
    rate,
    pitch,
    volume: '+0%'
  });
  const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  return { bytes, type: 'audio/mpeg', engine: voice };
}

async function synthesize(req, res) {
  const raw = req.method === 'GET' ? req.query?.text : (req.body?.text ?? req.body?.message);
  const text = cleanSpeechText(raw);
  if (!text) return res.status(400).json({ error: 'text required' });

  const requested = String(req.method === 'GET' ? req.query?.voice : req.body?.voice || 'male').toLowerCase();
  const rate = String(req.method === 'GET' ? req.query?.rate : req.body?.rate || '-6%');
  const pitch = String(req.method === 'GET' ? req.query?.pitch : req.body?.pitch || '-2Hz');

  let result = null;
  try {
    result = await pocketSpeech(text, requested);
  } catch (error) {
    console.error('Pocket Persian TTS failed:', error?.message || error);
  }

  if (!result) {
    try {
      result = await edgeSpeech(text, requested, rate, pitch);
    } catch (error) {
      console.error('Edge Persian TTS fallback failed:', error?.message || error);
    }
  }

  if (!result) return res.status(502).json({ error: 'Persian TTS unavailable' });

  res.setHeader('Content-Type', result.type);
  res.setHeader('Content-Length', String(result.bytes.length));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-ARIA-TTS-Engine', result.engine);
  return res.status(200).send(result.bytes);
}

export function registerTts(app) {
  app.post('/api/tts', synthesize);
  app.get('/api/tts', synthesize);
}
