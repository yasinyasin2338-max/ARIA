import { generateSpeech } from '@bestcodes/edge-tts/dist/index.mjs';
import { Client, handle_file } from '@gradio/client';

const SPACE = 'hugging-apps/pocket-tts-farsi-demo';
const SPACE_BASE = 'https://hugging-apps-pocket-tts-farsi-demo.hf.space';
const REFERENCE_VOICE = 'https://huggingface.co/mehdi-hf/pocket-tts-farsi/resolve/main/example_voice.wav';
const VOICES = {
  male: 'fa-IR-FaridNeural',
  female: 'fa-IR-DilaraNeural'
};
let gradioClientPromise = null;

function cleanSpeechText(value) {
  return String(value ?? '')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/[\u200c\u200f]/g, ' ')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[`*_#>|~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1200);
}

async function getGradioClient() {
  if (!gradioClientPromise) {
    gradioClientPromise = Client.connect(SPACE).catch((error) => {
      gradioClientPromise = null;
      throw error;
    });
  }
  return gradioClientPromise;
}

async function withTimeout(promise, ms, label) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timeout`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function fileUrlFromResult(file) {
  if (!file) return '';
  if (typeof file === 'string') {
    if (/^https?:\/\//i.test(file)) return file;
    return `${SPACE_BASE}/gradio_api/file=${encodeURIComponent(file)}`;
  }
  if (typeof file.url === 'string' && /^https?:\/\//i.test(file.url)) return file.url;
  if (typeof file.path === 'string' && file.path) {
    return `${SPACE_BASE}/gradio_api/file=${encodeURIComponent(file.path)}`;
  }
  return '';
}

async function pocketSpaceSpeech(text) {
  const client = await withTimeout(getGradioClient(), 25_000, 'Pocket TTS connect');
  const result = await withTimeout(
    client.predict('/synthesize', {
      text,
      voice_audio: handle_file(REFERENCE_VOICE),
      temperature: 0.3,
      eos_threshold: -2.0,
      max_tokens: 25,
      voice_sec: 5.0,
      pause_sec: 0.15,
      do_normalize: true
    }),
    90_000,
    'Pocket TTS generation'
  );

  const file = Array.isArray(result?.data) ? result.data[0] : null;
  const url = fileUrlFromResult(file);
  if (!url) throw new Error('Pocket TTS returned no audio URL');

  const audioResponse = await withTimeout(fetch(url, {
    headers: { 'User-Agent': 'ARIA-Server-TTS-Proxy/2.0' }
  }), 30_000, 'Pocket TTS audio fetch');
  if (!audioResponse.ok) throw new Error(`Pocket TTS audio HTTP ${audioResponse.status}`);

  const type = String(audioResponse.headers.get('content-type') || 'audio/wav').toLowerCase();
  const bytes = Buffer.from(await audioResponse.arrayBuffer());
  if (bytes.length < 1024) throw new Error(`Pocket TTS audio too small: ${bytes.length}`);
  return { bytes, type: type.startsWith('audio/') ? type : 'audio/wav', engine: 'pocket-tts-farsi-space' };
}

async function edgeSpeech(text, requested, rate, pitch) {
  const voice = requested === 'female' || requested.includes('dilara') ? VOICES.female : VOICES.male;
  const audio = await generateSpeech({ text, voice, rate, pitch, volume: '+0%' });
  const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
  if (bytes.length < 1024) throw new Error('Edge TTS returned empty audio');
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
    result = await pocketSpaceSpeech(text);
  } catch (error) {
    console.error('Pocket Persian TTS Space failed:', error?.message || error);
    gradioClientPromise = null;
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
