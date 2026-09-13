from __future__ import annotations

import contextlib
import hashlib
import json
import os
import time
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse

APP_NAME = "Universal AI Tool Hub"
VERSION = "0.7.1-live-bootstrap"
STARTED = time.time()

TOOLS = {
    "local.echo": {
        "description": "Return the supplied text. No external side effects.",
        "risk": "LOW",
    },
    "local.text_stats": {
        "description": "Count characters, words and lines in text.",
        "risk": "LOW",
    },
    "local.sha256": {
        "description": "Calculate a SHA-256 digest for text.",
        "risk": "LOW",
    },
}


def run_tool(tool_id: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if tool_id == "local.echo":
        return {"status": "ok", "tool_id": tool_id, "output": str(arguments.get("text", ""))}
    if tool_id == "local.text_stats":
        text = str(arguments.get("text", ""))
        return {
            "status": "ok",
            "tool_id": tool_id,
            "output": {
                "characters": len(text),
                "words": len(text.split()),
                "lines": len(text.splitlines()) if text else 0,
            },
        }
    if tool_id == "local.sha256":
        text = str(arguments.get("text", ""))
        return {
            "status": "ok",
            "tool_id": tool_id,
            "output": hashlib.sha256(text.encode("utf-8")).hexdigest(),
        }
    raise KeyError(tool_id)


MCP_AVAILABLE = False
mcp = None
try:
    from mcp.server import MCPServer

    mcp = MCPServer(
        APP_NAME,
        version=VERSION,
        instructions=(
            "Bootstrap MCP gateway for Universal AI Tool Hub. "
            "Only low-risk local tools are enabled during live deployment verification."
        ),
    )
    MCP_AVAILABLE = True

    @mcp.tool(description="List low-risk tools available in the live bootstrap registry.")
    def list_tools() -> dict:
        return {"tools": [{"id": k, **v} for k, v in TOOLS.items()]}

    @mcp.tool(description="Search the live bootstrap registry for a relevant tool.")
    def search_tools(query: str, limit: int = 8) -> dict:
        q = (query or "").lower().strip()
        rows = []
        for tool_id, meta in TOOLS.items():
            hay = f"{tool_id} {meta['description']}".lower()
            if not q or all(token in hay for token in q.split()):
                rows.append({"id": tool_id, **meta})
        return {"query": query, "tools": rows[: max(1, min(limit, 20))]}

    @mcp.tool(description="Execute one low-risk local bootstrap tool.")
    def execute_tool(tool_id: str, arguments_json: str = "{}") -> dict:
        try:
            args = json.loads(arguments_json or "{}")
        except json.JSONDecodeError as exc:
            return {"status": "error", "error": f"invalid arguments_json: {exc}"}
        try:
            return run_tool(tool_id, args)
        except KeyError:
            return {"status": "error", "error": "unknown tool"}
except Exception:
    MCP_AVAILABLE = False
    mcp = None


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    if MCP_AVAILABLE and mcp is not None:
        async with mcp.session_manager.run():
            yield
    else:
        yield


app = FastAPI(title=APP_NAME, version=VERSION, lifespan=lifespan)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


if MCP_AVAILABLE and mcp is not None:
    app.mount(
        "/mcp",
        mcp.streamable_http_app(
            streamable_http_path="/",
            stateless_http=True,
            json_response=True,
        ),
    )


@app.get("/", response_class=HTMLResponse)
def home():
    mcp_text = "available" if MCP_AVAILABLE else "sdk unavailable"
    return f"""<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>{APP_NAME}</title><style>body{{font-family:system-ui;background:#0f1020;color:#f4f4ff;max-width:760px;margin:48px auto;padding:20px}}code{{background:#1b1d33;padding:3px 7px;border-radius:6px}}.ok{{color:#78e08f}}</style></head><body><h1>{APP_NAME}</h1><p class='ok'>v0.7.1 live bootstrap is running.</p><p>MCP: <code>{mcp_text}</code></p><p>Health: <code>/health</code> · Ready: <code>/ready</code> · MCP: <code>/mcp</code></p><p>This bootstrap exposes only low-risk local tools while the full runtime is promoted.</p></body></html>"""


@app.get("/live")
def live():
    return {"status": "live", "service": APP_NAME, "version": VERSION}


@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": VERSION,
        "mcp_available": MCP_AVAILABLE,
        "uptime_seconds": int(time.time() - STARTED),
        "railway": {
            "project_id": os.getenv("RAILWAY_PROJECT_ID", ""),
            "service_id": os.getenv("RAILWAY_SERVICE_ID", ""),
            "deployment_id": os.getenv("RAILWAY_DEPLOYMENT_ID", ""),
            "commit_sha": os.getenv("RAILWAY_GIT_COMMIT_SHA", ""),
        },
    }


@app.get("/ready")
def ready():
    return {"status": "ready", "mcp_available": MCP_AVAILABLE, "tool_count": len(TOOLS)}


@app.get("/api/tools")
def list_rest_tools():
    return {"tools": [{"id": k, **v} for k, v in TOOLS.items()]}


@app.get("/api/tools/search")
def search_rest_tools(q: str = "", limit: int = 8):
    ql = q.lower().strip()
    rows = []
    for tool_id, meta in TOOLS.items():
        hay = f"{tool_id} {meta['description']}".lower()
        if not ql or all(token in hay for token in ql.split()):
            rows.append({"id": tool_id, **meta})
    return {"query": q, "tools": rows[: max(1, min(limit, 20))]}


@app.post("/api/execute/{tool_id}")
async def execute_rest_tool(tool_id: str, request: Request):
    try:
        arguments = await request.json()
    except Exception:
        arguments = {}
    try:
        return run_tool(tool_id, arguments if isinstance(arguments, dict) else {})
    except KeyError:
        raise HTTPException(status_code=404, detail="unknown tool")


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"status": "error", "error": type(exc).__name__})
