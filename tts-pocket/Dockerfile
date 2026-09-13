FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

RUN useradd --create-home --uid 10001 hub

COPY requirements-hub.txt /app/requirements-hub.txt
RUN pip install --upgrade pip && pip install -r /app/requirements-hub.txt

COPY hub_bootstrap.py /app/hub_bootstrap.py

USER hub

EXPOSE 8000

CMD ["sh", "-c", "uvicorn hub_bootstrap:app --host 0.0.0.0 --port ${PORT:-8000}"]
