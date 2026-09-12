const MAX_AGE_MS = 10 * 60 * 1000;
const results = new Map();

function validToken(token) {
  return typeof token === 'string' && /^[A-Za-z0-9_-]{32,160}$/.test(token);
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

  setInterval(() => {
    const cutoff = Date.now() - MAX_AGE_MS;
    for (const [token, result] of results) {
      if (result.at < cutoff) results.delete(token);
    }
  }, 60_000).unref?.();
}
