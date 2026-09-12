const MAX_AGE_MS = 10 * 60 * 1000;
const results = new Map();
const beacons = new Map();

function validToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,160}$/.test(token);
}

function validPart(value, max = 160) {
  return typeof value === 'string' && value.length > 0 && value.length <= max && /^[A-Za-z0-9_/-]+$/.test(value);
}

export function registerBridgeResults(app) {
  app.post('/api/bridge/result/:token', (req, res) => {
    const token = req.params.token;
    if (!validToken(token)) return res.status(400).json({ error: 'invalid token' });

    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const safe = {
      ok: body.ok === true,
      action: String(body.action || '').slice(0, 40),
      detail: String(body.detail || '').slice(0, 300),
      at: Date.now()
    };

    results.set(token, safe);
    res.json({ ok: true });
  });

  app.get('/api/bridge/result/:token', (req, res) => {
    const token = req.params.token;
    if (!validToken(token)) return res.status(400).json({ error: 'invalid token' });

    const result = results.get(token);
    if (!result) return res.status(404).json({ pending: true });
    res.json({ pending: false, ...result });
  });

  // Lightweight status beacons from the Android foreground bridge.
  // No screen content, credentials, audio, or arbitrary payloads are accepted here.
  app.get('/api/bridge/beacon/:kind/:device/*detail', (req, res) => {
    const kind = req.params.kind;
    const device = req.params.device;
    const detail = Array.isArray(req.params.detail) ? req.params.detail.join('/') : String(req.params.detail || '');
    if (!validPart(kind, 32) || !validPart(device, 64) || !validPart(detail, 220)) {
      return res.status(400).json({ error: 'invalid beacon' });
    }
    const safe = { kind, device, detail, at: Date.now() };
    beacons.set(device, safe);
    res.json({ ok: true });
  });

  app.get('/api/bridge/latest/:device', (req, res) => {
    const device = req.params.device;
    if (!validPart(device, 64)) return res.status(400).json({ error: 'invalid device' });
    const beacon = beacons.get(device);
    if (!beacon) return res.status(404).json({ found: false });
    res.json({ found: true, ...beacon });
  });

  setInterval(() => {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [token, result] of results) {
      if (result.at < cutoff) results.delete(token);
    }
    for (const [device, beacon] of beacons) {
      if (beacon.at < cutoff) beacons.delete(device);
    }
  }, 60_000).unref?.();
}
