import io
import re
import threading
from typing import Optional

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from pydantic import BaseModel
from scipy.io import wavfile
from pocket_tts import TTSModel

app = FastAPI(title="ARIA Persian TTS", version="1.0")

_model: Optional[TTSModel] = None
_voice_state = None
_model_lock = threading.Lock()
_generation_lock = threading.Lock()
_model_error: Optional[str] = None

CONFIG = "hf://mehdi-hf/pocket-tts-farsi/farsi.yaml"
VOICE = "hf://mehdi-hf/pocket-tts-farsi/example_voice.wav"


class TtsRequest(BaseModel):
    text: str
    voice: str | None = None
    rate: str | None = None
    pitch: str | None = None


def normalize_fa(text: str) -> str:
    text = str(text or "")
    text = re.sub(r"https?://\S+", " ", text)
    text = text.translate(str.maketrans({
        "ي": "ی", "ى": "ی", "ك": "ک", "ۀ": "ه", "ة": "ه",
        "ؤ": "و", "إ": "ا", "أ": "ا"
    }))
    text = re.sub(r"[`*_#>|~]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:1800]


def chunk_text(text: str) -> list[str]:
    # Pocket-TTS Farsi is most stable on short utterances. Keep each piece
    # around conversational sentence length and split long clauses by words.
    pieces = [p.strip() for p in re.split(r"(?<=[.!؟?؛;،,])\s+", text) if p.strip()]
    if not pieces:
        pieces = [text]

    out: list[str] = []
    for piece in pieces:
        words = piece.split()
        if len(words) <= 14:
            out.append(piece)
            continue
        for i in range(0, len(words), 12):
            part = " ".join(words[i:i + 12]).strip()
            if part:
                out.append(part)
    return out[:40]


def ensure_model() -> tuple[TTSModel, object]:
    global _model, _voice_state, _model_error
    if _model is not None and _voice_state is not None:
        return _model, _voice_state

    with _model_lock:
        if _model is not None and _voice_state is not None:
            return _model, _voice_state
        try:
            model = TTSModel.load_model(config=CONFIG, temp=0.3, eos_threshold=-2.0)
            state = model.get_state_for_audio_prompt(VOICE)
            _model = model
            _voice_state = state
            _model_error = None
            return model, state
        except Exception as exc:
            _model_error = f"{type(exc).__name__}: {exc}"
            raise


def warm_model() -> None:
    try:
        ensure_model()
        print("ARIA Persian Pocket TTS model ready", flush=True)
    except Exception as exc:
        print(f"ARIA Persian Pocket TTS warmup failed: {exc}", flush=True)


@app.on_event("startup")
def startup() -> None:
    threading.Thread(target=warm_model, name="tts-warmup", daemon=True).start()


@app.get("/health")
def health():
    return {
        "ok": True,
        "service": "ARIA Persian Pocket TTS",
        "model": "mehdi-hf/pocket-tts-farsi",
        "ready": _model is not None and _voice_state is not None,
        "modelError": _model_error,
    }


@app.post("/tts")
def synthesize(req: TtsRequest):
    text = normalize_fa(req.text)
    if not text:
        raise HTTPException(status_code=400, detail="text required")

    try:
        model, state = ensure_model()
        sample_rate = int(model.sample_rate)
        chunks = chunk_text(text)
        rendered: list[np.ndarray] = []

        with _generation_lock:
            for chunk in chunks:
                audio = model.generate_audio(state, chunk, frames_after_eos=0)
                arr = audio.detach().cpu().numpy().astype(np.float32).reshape(-1)
                if arr.size:
                    rendered.append(arr)
                    rendered.append(np.zeros(int(sample_rate * 0.12), dtype=np.float32))

        if not rendered:
            raise RuntimeError("empty audio")

        pcm = np.concatenate(rendered[:-1] if len(rendered) > 1 else rendered)
        buf = io.BytesIO()
        wavfile.write(buf, sample_rate, pcm)
        data = buf.getvalue()
        return Response(
            content=data,
            media_type="audio/wav",
            headers={
                "Cache-Control": "no-store",
                "X-ARIA-TTS": "pocket-tts-farsi",
                "X-ARIA-Sample-Rate": str(sample_rate),
            },
        )
    except HTTPException:
        raise
    except Exception as exc:
        print(f"TTS generation failed: {type(exc).__name__}: {exc}", flush=True)
        raise HTTPException(status_code=502, detail="Persian TTS generation failed")
