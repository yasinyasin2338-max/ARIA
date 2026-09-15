from __future__ import annotations

import contextlib
import html
import os
from dataclasses import dataclass
from typing import Iterable

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse, JSONResponse, PlainTextResponse
from mcp.server import MCPServer
from mcp.server.transport_security import TransportSecuritySettings

APP_NAME = "Universal AI Tool Hub — ChatGPT Public Surface"
VERSION = "0.2.3-prep"
MAX_QUERY_CHARS = 600
MAX_GOAL_CHARS = 1200
MAX_ID_CHARS = 80
MAX_LIST_ITEMS = 20
PRODUCTION_HOST = "aria-v4-production.up.railway.app"


def _csv_env(name: str, defaults: tuple[str, ...]) -> list[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return list(defaults)
    return [item.strip() for item in raw.split(",") if item.strip()]


def _optional_public_hosts() -> tuple[str, ...]:
    """Return exact deployment hosts injected by supported hosting environments.

    Never accept an arbitrary request Host header here. Only deployment-time
    environment variables can expand the allowlist.
    """
    hosts: list[str] = []
    for name in ("RENDER_EXTERNAL_HOSTNAME", "PUBLIC_MCP_HOST"):
        value = os.environ.get(name, "").strip().lower()
        if value and "/" not in value and "://" not in value and value not in hosts:
            hosts.append(value)
    return tuple(hosts)


OPTIONAL_PUBLIC_HOSTS = _optional_public_hosts()
DEFAULT_ALLOWED_HOSTS = (
    "127.0.0.1:*",
    "localhost:*",
    "[::1]:*",
    PRODUCTION_HOST,
    *OPTIONAL_PUBLIC_HOSTS,
)
DEFAULT_ALLOWED_ORIGINS = (
    "http://127.0.0.1:*",
    "http://localhost:*",
    "http://[::1]:*",
    f"https://{PRODUCTION_HOST}",
    *(f"https://{host}" for host in OPTIONAL_PUBLIC_HOSTS),
)

TRANSPORT_SECURITY = TransportSecuritySettings(
    enable_dns_rebinding_protection=True,
    allowed_hosts=_csv_env("PUBLIC_MCP_ALLOWED_HOSTS", DEFAULT_ALLOWED_HOSTS),
    allowed_origins=_csv_env("PUBLIC_MCP_ALLOWED_ORIGINS", DEFAULT_ALLOWED_ORIGINS),
)


@dataclass(frozen=True)
class Workflow:
    id: str
    title: str
    description: str
    keywords: tuple[str, ...]
    requirements: tuple[str, ...] = ()


WORKFLOWS: tuple[Workflow, ...] = (
    Workflow(
        id="discover-capabilities",
        title="Discover Hub capabilities",
        description="Find a supported Hub capability for a user goal without executing external actions.",
        keywords=("discover", "find", "search", "tool", "capability", "workflow"),
    ),
    Workflow(
        id="plan-workflow",
        title="Plan a Hub workflow",
        description="Turn a plain-language goal into a small, reviewable sequence of Hub steps.",
        keywords=("plan", "workflow", "steps", "goal", "task"),
    ),
    Workflow(
        id="check-readiness",
        title="Check workflow readiness",
        description="Compare a workflow's declared requirements with user-supplied available capabilities. No account data is fetched.",
        keywords=("ready", "readiness", "connection", "permission", "setup", "requirement"),
    ),
    Workflow(
        id="explain-safety-boundary",
        title="Explain the public safety boundary",
        description="Explain what the ChatGPT-facing Hub surface can and cannot do before any future write-capable workflow is introduced.",
        keywords=("safety", "boundary", "read only", "read-only", "privacy", "permissions"),
    ),
)


def _clean_text(value: str, *, max_chars: int) -> str:
    text = " ".join(str(value or "").split()).strip()
    return text[:max_chars]


def _public_workflow(w: Workflow) -> dict[str, object]:
    return {
        "id": w.id,
        "title": w.title,
        "description": w.description,
        "requirements": list(w.requirements),
    }


def _rank(query: str, rows: Iterable[Workflow]) -> list[Workflow]:
    tokens = {token for token in _clean_text(query, max_chars=MAX_QUERY_CHARS).lower().split() if token}
    scored: list[tuple[int, Workflow]] = []
    for row in rows:
        haystack = " ".join((row.id, row.title, row.description, *row.keywords)).lower()
        score = sum(1 for token in tokens if token in haystack)
        scored.append((score, row))
    scored.sort(key=lambda item: (-item[0], item[1].id))
    return [row for score, row in scored if score > 0] if tokens else [row for _, row in scored]


def _annotation() -> dict[str, bool]:
    return {
        "readOnlyHint": True,
        "openWorldHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
    }


mcp = MCPServer(
    APP_NAME,
    version=VERSION,
    instructions=(
        "This is the narrow ChatGPT-facing surface of Universal AI Tool Hub. "
        "It exposes only explicit, read-only Hub-owned discovery and planning tools. "
        "It does not fetch private account data, return credentials, or relay arbitrary third-party actions."
    ),
)


@mcp.tool(
    title="List supported Hub workflows",
    description="List the explicit read-only Hub-owned workflows available on this public ChatGPT surface.",
    annotations=_annotation(),
)
def list_supported_workflows() -> dict:
    return {
        "status": "ok",
        "workflows": [_public_workflow(w) for w in WORKFLOWS],
        "external_action_executed": False,
    }


@mcp.tool(
    title="Find a Hub workflow",
    description="Find the most relevant supported Hub workflow for a plain-language goal. This performs no external action.",
    annotations=_annotation(),
)
def find_workflow(query: str, limit: int = 5) -> dict:
    cleaned = _clean_text(query, max_chars=MAX_QUERY_CHARS)
    if not cleaned:
        return {"status": "invalid_input", "error": "query is required", "matches": []}
    safe_limit = max(1, min(int(limit or 5), 10))
    rows = _rank(cleaned, WORKFLOWS)[:safe_limit]
    return {
        "status": "ok",
        "query": cleaned,
        "matches": [_public_workflow(w) for w in rows],
        "external_action_executed": False,
    }


@mcp.tool(
    title="Explain a Hub workflow",
    description="Explain one supported Hub workflow and its side-effect boundary. This performs no external action.",
    annotations=_annotation(),
)
def explain_workflow(workflow_id: str) -> dict:
    cleaned = _clean_text(workflow_id, max_chars=MAX_ID_CHARS)
    row = next((w for w in WORKFLOWS if w.id == cleaned), None)
    if row is None:
        return {"status": "not_found", "workflow_id": cleaned, "external_action_executed": False}
    return {
        "status": "ok",
        "workflow": _public_workflow(row),
        "side_effects": "none",
        "credentials_returned": False,
        "private_account_data_fetched": False,
        "external_action_executed": False,
    }


@mcp.tool(
    title="Plan a safe Hub workflow",
    description="Create a small reviewable advisory plan for a user goal. The plan executes nothing and does not contact external services.",
    annotations=_annotation(),
)
def plan_workflow(goal: str) -> dict:
    cleaned = _clean_text(goal, max_chars=MAX_GOAL_CHARS)
    if not cleaned:
        return {"status": "invalid_input", "error": "goal is required", "external_action_executed": False}
    matches = _rank(cleaned, WORKFLOWS)
    selected = matches[0] if matches else WORKFLOWS[1]
    return {
        "status": "advisory_only",
        "goal": cleaned,
        "recommended_workflow": _public_workflow(selected),
        "steps": [
            "Confirm the requested outcome and the minimum information needed.",
            "Check declared workflow requirements using only user-supplied capability labels.",
            "Explain the side-effect boundary before any future write-capable operation is considered.",
        ],
        "credentials_returned": False,
        "private_account_data_fetched": False,
        "external_action_executed": False,
    }


@mcp.tool(
    title="Check workflow requirements",
    description="Compare one supported workflow's declared requirements with capability labels supplied by the user. No account or provider is queried.",
    annotations=_annotation(),
)
def check_workflow_requirements(workflow_id: str, available_capabilities: list[str] | None = None) -> dict:
    cleaned_id = _clean_text(workflow_id, max_chars=MAX_ID_CHARS)
    row = next((w for w in WORKFLOWS if w.id == cleaned_id), None)
    if row is None:
        return {"status": "not_found", "workflow_id": cleaned_id, "external_action_executed": False}

    raw = list(available_capabilities or [])[:MAX_LIST_ITEMS]
    available = {
        _clean_text(item, max_chars=MAX_ID_CHARS).lower()
        for item in raw
        if _clean_text(item, max_chars=MAX_ID_CHARS)
    }
    required = {item.lower() for item in row.requirements}
    missing = sorted(required - available)
    return {
        "status": "ready" if not missing else "missing_requirements",
        "workflow_id": row.id,
        "required": sorted(required),
        "available": sorted(available),
        "missing": missing,
        "source": "user_supplied_capability_labels_only",
        "private_account_data_fetched": False,
        "external_action_executed": False,
    }


@contextlib.asynccontextmanager
async def lifespan(_: FastAPI):
    async with mcp.session_manager.run():
        yield


app = FastAPI(
    title=APP_NAME,
    version=VERSION,
    lifespan=lifespan,
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("Cache-Control", "no-store")
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault("Referrer-Policy", "no-referrer")
    response.headers.setdefault("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
    return response


app.mount(
    "/mcp",
    mcp.streamable_http_app(
        streamable_http_path="/",
        stateless_http=True,
        json_response=True,
        transport_security=TRANSPORT_SECURITY,
    ),
)


@app.get("/", response_class=HTMLResponse)
def home() -> str:
    return """<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Universal AI Tool Hub</title></head><body><main><h1>Universal AI Tool Hub</h1><p>ChatGPT public MCP preparation surface.</p><p>This surface is read-only and does not execute third-party actions.</p><nav><a href='/privacy'>Privacy</a> · <a href='/terms'>Terms</a> · <a href='/support'>Support</a></nav></main></body></html>"""


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": APP_NAME,
        "version": VERSION,
        "tool_count": 5,
        "surface": "read_only_public_prep",
    }


@app.get("/about", response_class=HTMLResponse)
def about() -> str:
    return home()


@app.get("/.well-known/openai-apps-challenge", response_class=PlainTextResponse)
def openai_apps_challenge() -> PlainTextResponse:
    token = os.environ.get("OPENAI_APPS_CHALLENGE_TOKEN", "").strip()
    if not token:
        raise HTTPException(status_code=404, detail="challenge not configured")
    return PlainTextResponse(token, media_type="text/plain")


@app.get("/privacy", response_class=HTMLResponse)
def privacy() -> str:
    return """<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Privacy — Universal AI Tool Hub</title></head><body><main><h1>Privacy</h1><p>This preparation surface is designed to minimize data collection. Its MCP tools process only the text or capability labels supplied for the current request and do not fetch private Hub account data, provider credentials, passwords, API keys, access tokens, refresh tokens, or authorization headers.</p><p>The service may receive standard network metadata needed to deliver HTTP requests through its hosting infrastructure. Do not submit secrets through public tool inputs.</p><p>If a future version adds authenticated or provider-backed workflows, this policy must be updated before those capabilities are made public.</p></main></body></html>"""


@app.get("/terms", response_class=HTMLResponse)
def terms() -> str:
    return """<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Terms — Universal AI Tool Hub</title></head><body><main><h1>Terms</h1><p>This preparation surface provides read-only workflow discovery and planning. It does not execute third-party actions, make purchases, modify external data, or grant access to third-party services.</p><p>Users must not submit passwords, MFA codes, API keys, OAuth secrets, session cookies, or other credentials. Availability and capabilities may change while the app remains in preparation.</p></main></body></html>"""


@app.get("/support", response_class=HTMLResponse)
def support() -> str:
    repo = html.escape("https://github.com/yasinyasin2338-max/ARIA/issues")
    return f"""<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'><title>Support — Universal AI Tool Hub</title></head><body><main><h1>Support</h1><p>For technical issues, use the public GitHub issue tracker:</p><p><a href='{repo}' rel='noopener noreferrer'>{repo}</a></p><p>Never include passwords, MFA codes, API keys, access tokens, refresh tokens, client secrets, or payment information in a support issue.</p></main></body></html>"""


@app.exception_handler(Exception)
async def unhandled_error(_: Request, exc: Exception):
    return JSONResponse(status_code=500, content={"status": "error", "error": type(exc).__name__})
