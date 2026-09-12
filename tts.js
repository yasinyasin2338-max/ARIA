import { generateSpeech } from '@bestcodes/edge-tts/dist/index.mjs';

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
    .slice(0, 2200);
}

async function synthesize(req, res) {
  try {
    const raw = req.method === 'GET' ? req.query?.text : (req.body?.text ?? req.body?.message);
    const text = cleanSpeechText(raw);
    if (!text) return res.status(400).json({ error: 'text required' });

    const requested = String(req.method === 'GET' ? req.query?.voice : req.body?.voice || 'male').toLowerCase();
    const voice = requested === 'female' || requested.includes('dilara') ? VOICES.female : VOICES.male;
    const rate = String(req.method === 'GET' ? req.query?.rate : req.body?.rate || '-6%');
    const pitch = String(req.method === 'GET' ? req.query?.pitch : req.body?.pitch || '-2Hz');

    const audio = await generateSpeech({
      text,
      voice,
      rate,
      pitch,
      volume: '+0%'
    });

    const bytes = Buffer.isBuffer(audio) ? audio : Buffer.from(audio);
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(bytes.length));
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-ARIA-Voice', voice);
    return res.status(200).send(bytes);
  } catch (error) {
    console.error('Persian neural TTS failed:', error);
    return res.status(502).json({ error: 'Persian neural TTS failed' });
  }
}

export function registerTts(app) {
  app.post('/api/tts', synthesize);
  app.get('/api/tts', synthesize);
}
