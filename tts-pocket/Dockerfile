FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UTH_DB_PATH=/app/data/hub.db \
    UTH_VAULT_KEY_FILE=/app/data/vault.key

WORKDIR /app
COPY runtime-parts /tmp/runtime-parts

RUN python - <<'PY'
import base64, glob, hashlib, io, lzma, pathlib, tarfile
parts = sorted(glob.glob('/tmp/runtime-parts/xz*.b64'))
assert len(parts) == 12, f'expected 12 runtime parts, got {len(parts)}'
payload = ''.join(pathlib.Path(p).read_text() for p in parts)
compressed = base64.b64decode(payload)
expected = 'a1fc2746b8073f46d2761ded2cde387cc11db12d699c280373104d4e82905be8'
actual = hashlib.sha256(compressed).hexdigest()
assert actual == expected, f'runtime archive checksum mismatch: {actual}'
data = lzma.decompress(compressed)
root = pathlib.Path('/app').resolve()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as tf:
    for member in tf.getmembers():
        target = (root / member.name).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f'unsafe archive path: {member.name}')
    tf.extractall(root)
PY

COPY token-helper.html /app/app/static/token-helper.html
COPY token-helper.js /app/app/static/token-helper.js
COPY provider-setup.html /app/app/static/provider-setup.html
COPY provider-setup.js /app/app/static/provider-setup.js
COPY oauth-patch.tar.xz.b64 /tmp/oauth-patch.b64

RUN python - <<'PY'
import base64, hashlib, io, lzma, pathlib, tarfile
payload = pathlib.Path('/tmp/oauth-patch.b64').read_text().strip()
compressed = base64.b64decode(payload)
expected = '24ee0eb5cc7675f89136c1fff7ef63c9474271dae527c15704c77775e60b6e35'
actual = hashlib.sha256(compressed).hexdigest()
assert actual == expected, f'oauth patch checksum mismatch: {actual}'
data = lzma.decompress(compressed)
root = pathlib.Path('/app').resolve()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as tf:
    for member in tf.getmembers():
        target = (root / member.name).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f'unsafe oauth patch path: {member.name}')
    tf.extractall(root)
PY

COPY model-patch.tar.xz.b64 /tmp/model-patch.b64

RUN python - <<'PY'
import base64, hashlib, io, lzma, pathlib, tarfile
payload = pathlib.Path('/tmp/model-patch.b64').read_text().strip()
compressed = base64.b64decode(payload)
expected = 'e31b8a97aa94de55e5b9f0a0e78592756b1419395504405194e12ac7e4172582'
actual = hashlib.sha256(compressed).hexdigest()
assert actual == expected, f'model patch checksum mismatch: {actual}'
data = lzma.decompress(compressed)
root = pathlib.Path('/app').resolve()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as tf:
    for member in tf.getmembers():
        target = (root / member.name).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f'unsafe model patch path: {member.name}')
    tf.extractall(root)
PY

COPY connector-patch.tar.xz.b64 /tmp/connector-patch.b64

RUN python - <<'PY'
import base64, hashlib, io, lzma, pathlib, tarfile
payload = pathlib.Path('/tmp/connector-patch.b64').read_text().strip()
compressed = base64.b64decode(payload)
expected = '9aa58e894a7a860c06fe835d076e61f4330252ae1db7eaa4730146846587c5cb'
actual = hashlib.sha256(compressed).hexdigest()
assert actual == expected, f'connector patch checksum mismatch: {actual}'
data = lzma.decompress(compressed)
root = pathlib.Path('/app').resolve()
with tarfile.open(fileobj=io.BytesIO(data), mode='r:') as tf:
    for member in tf.getmembers():
        target = (root / member.name).resolve()
        if target != root and root not in target.parents:
            raise RuntimeError(f'unsafe connector patch path: {member.name}')
    tf.extractall(root)
PY

RUN python - <<'PY'
from pathlib import Path
p = Path('/app/app/static/index.html')
html = p.read_text()
if 'data-hub-admin-links' not in html:
    controls = '''
      <button data-hub-admin-links onclick="location.href='/static/provider-setup.html'">راهنمای اتصال سرویس‌ها</button>
      <button onclick="location.href='/static/token-helper.html'">مدیریت Token</button>
      <button onclick="location.href='/static/oauth-app-manager.html'">تنظیم OAuth سرویس‌ها</button>
      <button class="secondary" onclick="fetch('/api/auth/logout',{method:'POST',credentials:'same-origin'}).then(()=>location.reload())">خروج</button>
'''
    html = html.replace('</nav>', controls + '</nav>', 1)
html = html.replace('v0.7 — Live Deployment Readiness', 'v0.7.1 — Secure Compact Runtime')
p.write_text(html)
PY

COPY secure_entrypoint.py /app/secure_entrypoint.py

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir '.[production]' \
    && python -m py_compile /app/oauth_entry.py /app/connector_entry.py /app/secure_entrypoint.py /app/app/core/oauth_server.py /app/app/config.py /app/app/models/gateway.py /app/app/connectors/oauth/service.py /app/app/container.py \
    && groupadd --system hub \
    && useradd --system --gid hub --home /app hub \
    && mkdir -p /app/data \
    && chown -R hub:hub /app \
    && rm -rf /tmp/runtime-parts /tmp/oauth-patch.b64 /tmp/model-patch.b64 /tmp/connector-patch.b64

USER hub
EXPOSE 8000
CMD ["python", "/app/secure_entrypoint.py"]
