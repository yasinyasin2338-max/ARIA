FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/tmp/huggingface

RUN apt-get update && apt-get install -y --no-install-recommends \
    libsndfile1 ca-certificates git && \
    rm -rf /var/lib/apt/lists/*

RUN python -m pip install --no-cache-dir --upgrade pip && \
    python -m pip install --no-cache-dir --index-url https://download.pytorch.org/whl/cpu torch && \
    python -m pip install --no-cache-dir pocket-tts fastapi "uvicorn[standard]" scipy soundfile huggingface_hub

WORKDIR /app
COPY server.py /app/server.py

CMD ["sh", "-c", "uvicorn server:app --host 0.0.0.0 --port ${PORT:-8000}"]
