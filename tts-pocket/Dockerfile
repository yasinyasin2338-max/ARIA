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

RUN python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir '.[production]' \
    && groupadd --system hub \
    && useradd --system --gid hub --home /app hub \
    && mkdir -p /app/data \
    && chown -R hub:hub /app \
    && rm -rf /tmp/runtime-parts

USER hub
EXPOSE 8000
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
