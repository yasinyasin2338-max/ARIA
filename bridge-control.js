import crypto from 'node:crypto';

const DEVICE_TTL_MS = 15 * 60 * 1000;
const RESULT_TTL_MS = 15 * 60 * 1000;
const devices = new Map();
const pending = new Map();
const results = new Map();
const usedAdminNonces = new Map();

function validPart(value, min = 1, max = 160) {
  return typeof value === 'string' && value.length >= min && value.length <= max && /^[A-Za-z0-9_.:-]+$/.test(value);
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function secureEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(a, 'hex'), Buffer.from(b, 'hex')); } catch { return false; }
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  return h.startsWith('Bearer ') ? h.slice(7) : '';
}

function authenticatedDevice(req, device) {
  const d = devices.get(device);
  if (!d) return false;
  const token = bearer(req);
  if (!token) return false;
  return secureEqualHex(d.tokenHash, sha256(token));
}

function safeAction(raw) {
  const action = String(raw || '').toUpperCase();
  const allowed = new Set([
    'PING','HOME','BACK','RECENTS','NOTIFICATIONS',
    'TAP','SWIPE','GET_UI','TYPE_TEXT','CLICK_TEXT',
    'SCROLL_FORWARD','SCROLL_BACKWARD','OPEN_APP'
  ]);
  return allowed.has(action) ? action : '';
}

function canonicalCommand(q, device) {
  return [
    'CMD', device, String(q.ts || ''), String(q.nonce || ''), String(q.action || '').toUpperCase(),
    String(q.x || ''), String(q.y || ''), String(q.x2 || ''), String(q.y2 || ''),
    String(q.duration || ''), String(q.package || ''), String(q.text64 || '')
  ].join('|');
}

function canonicalRead(q, device, op) {
  return [op, device, String(q.ts || ''), String(q.nonce || '')].join('|');
}

function verifyAdmin(q, payload) {
  const secret = process.env.ARIA_BRIDGE_ADMIN_SECRET || '';
  if (secret.length < 32) return false;
  const ts = Number(q.ts);
  const nonce = String(q.nonce || '');
  const sig = String(q.sig || '').toLowerCase();
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 180) return false;
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(nonce)) return false;
  if (!/^[a-f0-9]{64}$/.test(sig)) return false;
  const seenAt = usedAdminNonces.get(nonce);
  if (seenAt && Date.now() - seenAt < 10 * 60 * 1000) return false;
  const expected = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  if (!secureEqualHex(expected, sig)) return false;
  usedAdminNonces.set(nonce, Date.now());
  return true;
}

function clampInt(v, min, max, fallback = 0) {
  const n = Number.parseInt(String(v ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

export function registerBridgeControl(app) {
  app.post('/api/bridge/v2/register', (req, res) => {
    const device = String(req.body?.device || '');
    const token = String(req.body?.token || '');
    if (!validPart(device, 12, 64) || token.length < 32 || token.length > 200) {
      return res.status(400).json({ ok: false, error: 'invalid registration' });
    }
    devices.set(device, { tokenHash: sha256(token), lastSeen: Date.now() });
    return res.json({ ok: true, pollMs: 1500 });
  });

  app.get('/api/bridge/v2/poll/:device', (req, res) => {
    const device = String(req.params.device || '');
    if (!validPart(device, 12, 64) || !authenticatedDevice(req, device)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const d = devices.get(device); d.lastSeen = Date.now();
    const command = pending.get(device);
    if (!command) return res.status(204).end();
    pending.delete(device);
    return res.json({ ok: true, command });
  });

  app.post('/api/bridge/v2/result/:device', (req, res) => {
    const device = String(req.params.device || '');
    if (!validPart(device, 12, 64) || !authenticatedDevice(req, device)) {
      return res.status(401).json({ ok: false, error: 'unauthorized' });
    }
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const id = String(body.id || '').slice(0, 80);
    const action = safeAction(body.action);
    const detail = String(body.detail || '').slice(0, 12000);
    results.set(device, {
      id,
      action,
      ok: body.ok === true,
      detail,
      at: Date.now()
    });
    const d = devices.get(device); d.lastSeen = Date.now();
    return res.json({ ok: true });
  });

  // Signed one-shot control endpoint. The HMAC secret is never sent to the phone or URL.
  app.get('/api/bridge/v2/admin/command/:device', (req, res) => {
    const device = String(req.params.device || '');
    if (!validPart(device, 12, 64)) return res.status(400).json({ ok: false, error: 'invalid device' });
    if (!verifyAdmin(req.query, canonicalCommand(req.query, device))) {
      return res.status(401).json({ ok: false, error: 'bad signature' });
    }
    const action = safeAction(req.query.action);
    if (!action) return res.status(400).json({ ok: false, error: 'invalid action' });
    const command = {
      id: String(req.query.nonce),
      action,
      x: clampInt(req.query.x, 0, 10000),
      y: clampInt(req.query.y, 0, 10000),
      x2: clampInt(req.query.x2, 0, 10000),
      y2: clampInt(req.query.y2, 0, 10000),
      duration: clampInt(req.query.duration, 50, 5000, 450),
      packageName: String(req.query.package || '').slice(0, 180),
      text64: String(req.query.text64 || '').slice(0, 8000),
      queuedAt: Date.now()
    };
    pending.set(device, command);
    return res.json({ ok: true, queued: command.id, action });
  });

  app.get('/api/bridge/v2/admin/result/:device', (req, res) => {
    const device = String(req.params.device || '');
    if (!validPart(device, 12, 64)) return res.status(400).json({ ok: false, error: 'invalid device' });
    if (!verifyAdmin(req.query, canonicalRead(req.query, device, 'RESULT'))) {
      return res.status(401).json({ ok: false, error: 'bad signature' });
    }
    const result = results.get(device);
    if (!result) return res.status(404).json({ ok: false, pending: true });
    return res.json({ ok: true, pending: false, result });
  });

  app.get('/api/bridge/v2/admin/status/:device', (req, res) => {
    const device = String(req.params.device || '');
    if (!validPart(device, 12, 64)) return res.status(400).json({ ok: false, error: 'invalid device' });
    if (!verifyAdmin(req.query, canonicalRead(req.query, device, 'STATUS'))) {
      return res.status(401).json({ ok: false, error: 'bad signature' });
    }
    const d = devices.get(device);
    if (!d) return res.status(404).json({ ok: false, online: false });
    return res.json({ ok: true, online: Date.now() - d.lastSeen < 20_000, lastSeen: d.lastSeen, commandPending: pending.has(device) });
  });

  setInterval(() => {
    const now = Date.now();
    for (const [device, d] of devices) if (now - d.lastSeen > DEVICE_TTL_MS) devices.delete(device);
    for (const [device, r] of results) if (now - r.at > RESULT_TTL_MS) results.delete(device);
    for (const [nonce, at] of usedAdminNonces) if (now - at > 10 * 60 * 1000) usedAdminNonces.delete(nonce);
  }, 60_000).unref?.();
}
