FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UTH_DB_PATH=/app/data/hub.db \
    UTH_VAULT_KEY_FILE=/app/data/vault.key

WORKDIR /app
ARG UTH_RUNTIME_URL

RUN test -n "$UTH_RUNTIME_URL" \
    && python -c "import sys,urllib.request,zipfile; u=sys.argv[1]; p='/tmp/runtime.zip'; urllib.request.urlretrieve(u,p); zipfile.ZipFile(p).extractall('/app')" "$UTH_RUNTIME_URL" \
    && python -m pip install --upgrade pip \
    && python -m pip install --no-cache-dir '.[production]' \
    && rm -f /tmp/runtime.zip \
    && groupadd --system hub \
    && useradd --system --gid hub --home /app hub \
    && mkdir -p /app/data \
    && chown -R hub:hub /app

USER hub
EXPOSE 8000

CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
