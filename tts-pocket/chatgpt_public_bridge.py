from __future__ import annotations

import html
import json
import os
from dataclasses import dataclass
from typing import Any, Iterable

APP_NAME = "Universal AI Tool Hub — ChatGPT Public Surface"
VERSION = "0.3.0-prep"
DEFAULT_PROTOCOL = "2025-06-18"
SUPPORTED_PROTOCOLS = {"2025-06-18", "2025-03-26"}
MAX_BODY_BYTES = 64 * 1024
MAX_QUERY_CHARS = 600
MAX_GOAL_CHARS = 1200
MAX_ID_CHARS = 80
MAX_LIST_ITEMS = 20
PRODUCTION_HOST = "aria-v4-production.up.railway.app"


def _csv_env(name: str, defaults: tuple[str, ...]) -> set[str]:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return set(defaults)
    return {item.strip().lower() for item in raw.split(",") if item.strip()}


ALLOWED_HOSTS = _csv_env(
    "PUBLIC_MCP_ALLOWED_HOSTS",
    (PRODUCTION_HOST, "127.0.0.1", "127.0.0.1:8000", "localhost", "localhost:8000"),
)
ALLOWED_ORIGINS = _csv_env(
    "PUBLIC_MCP_ALLOWED_ORIGINS",
    (
        f"https://{PRODUCTION_HOST}",
        "https://chatgpt.com",
        "https://chat.openai.com",
        "http://127.0.0.1:8000",
        "http://localhost:8000",
    ),
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


def _clean_text(value: Any, *, max_chars: int) -> str:
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


def _tool_annotations() -> dict[str, bool]:
    return {
        "readOnlyHint": True,
        "openWorldHint": False,
        "destructiveHint": False,
        "idempotentHint": True,
    }


def _tools() -> list[dict[str, Any]]:
    ann = _tool_annotations()
    return [
        {
            "name": "list_supported_workflows",
            "title": "List supported Hub workflows",
            "description": "List the explicit read-only Hub-owned workflows available on this public ChatGPT surface.",
            "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False},
            "annotations": ann,
        },
        {
            "name": "find_workflow",
            "title": "Find a Hub workflow",
            "description": "Find the most relevant supported Hub workflow for a plain-language goal. This performs no external action.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "minLength": 1, "maxLength": MAX_QUERY_CHARS},
                    "limit": {"type": "integer", "minimum": 1, "maximum": 10, "default": 5},
                },
                "required": ["query"],
                "additionalProperties": False,
            },
            "annotations": ann,
        },
        {
            "name": "explain_workflow",
            "title": "Explain a Hub workflow",
            "description": "Explain one supported Hub workflow and its side-effect boundary. This performs no external action.",
            "inputSchema": {
                "type": "object",
                "properties": {"workflow_id": {"type": "string", "minLength": 1, "maxLength": MAX_ID_CHARS}},
                "required": ["workflow_id"],
                "additionalProperties": False,
            },
            "annotations": ann,
        },
        {
            "name": "plan_workflow",
            "title": "Plan a safe Hub workflow",
            "description": "Create a small reviewable advisory plan for a user goal. The plan executes nothing and does not contact external services.",
            "inputSchema": {
                "type": "object",
                "properties": {"goal": {"type": "string", "minLength": 1, "maxLength": MAX_GOAL_CHARS}},
                "required": ["goal"],
                "additionalProperties": False,
            },
            "annotations": ann,
        },
        {
            "name": "check_workflow_requirements",
            "title": "Check workflow requirements",
            "description": "Compare one supported workflow's declared requirements with capability labels supplied by the user. No account or provider is queried.",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "workflow_id": {"type": "string", "minLength": 1, "maxLength": MAX_ID_CHARS},
                    "available_capabilities": {
                        "type": "array",
                        "maxItems": MAX_LIST_ITEMS,
                        "items": {"type": "string", "maxLength": MAX_ID_CHARS},
                    },
                },
                "required": ["workflow_id"],
                "additionalProperties": False,
            },
            "annotations": ann,
        },
    ]


def _call_tool(name: str, arguments: dict[str, Any]) -> dict[str, Any]:
    if name == "list_supported_workflows":
        return {
            "status": "ok",
            "workflows": [_public_workflow(w) for w in WORKFLOWS],
            "external_action_executed": False,
        }

    if name == "find_workflow":
        cleaned = _clean_text(arguments.get("query"), max_chars=MAX_QUERY_CHARS)
        if not cleaned:
            return {"status": "invalid_input", "error": "query is required", "matches": [], "external_action_executed": False}
        try:
            limit = int(arguments.get("limit", 5))
        except (TypeError, ValueError):
            limit = 5
        safe_limit = max(1, min(limit, 10))
        rows = _rank(cleaned, WORKFLOWS)[:safe_limit]
        return {
            "status": "ok",
            "query": cleaned,
            "matches": [_public_workflow(w) for w in rows],
            "external_action_executed": False,
        }

    if name == "explain_workflow":
        cleaned = _clean_text(arguments.get("workflow_id"), max_chars=MAX_ID_CHARS)
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

    if name == "plan_workflow":
        cleaned = _clean_text(arguments.get("goal"), max_chars=MAX_GOAL_CHARS)
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

    if name == "check_workflow_requirements":
        cleaned_id = _clean_text(arguments.get("workflow_id"), max_chars=MAX_ID_CHARS)
        row = next((w for w in WORKFLOWS if w.id == cleaned_id), None)
        if row is None:
            return {"status": "not_found", "workflow_id": cleaned_id, "external_action_executed": False}
        raw = list(arguments.get("available_capabilities") or [])[:MAX_LIST_ITEMS]
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

    raise KeyError(name)


def _headers(scope: dict[str, Any]) -> dict[str, str]:
    out: dict[str, str] = {}
    for key, value in scope.get("headers", []):
        out[key.decode("latin-1").lower()] = value.decode("latin-1")
    return out


def _host_allowed(value: str) -> bool:
    host = value.strip().lower()
    if host in ALLOWED_HOSTS:
        return True
    if host.startswith("127.0.0.1:") and "127.0.0.1" in ALLOWED_HOSTS:
        return True
    if host.startswith("localhost:") and "localhost" in ALLOWED_HOSTS:
        return True
    return False


def _request_allowed(scope: dict[str, Any]) -> bool:
    headers = _headers(scope)
    host = headers.get("host", "")
    if host and not _host_allowed(host):
        return False
    origin = headers.get("origin", "").strip().lower()
    if origin and origin not in ALLOWED_ORIGINS:
        return False
    return True


def _base_headers(content_type: bytes = b"application/json; charset=utf-8") -> list[tuple[bytes, bytes]]:
    return [
        (b"content-type", content_type),
        (b"cache-control", b"no-store"),
        (b"x-content-type-options", b"nosniff"),
        (b"x-frame-options", b"DENY"),
        (b"referrer-policy", b"no-referrer"),
        (b"permissions-policy", b"camera=(), microphone=(), geolocation=()"),
    ]


async def _send_bytes(send, status: int, body: bytes, content_type: bytes) -> None:
    headers = _base_headers(content_type)
    headers.append((b"content-length", str(len(body)).encode("ascii")))
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


async def _send_json(send, status: int, payload: Any) -> None:
    body = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    await _send_bytes(send, status, body, b"application/json; charset=utf-8")


async def _read_body(receive) -> bytes:
    chunks: list[bytes] = []
    total = 0
    while True:
        message = await receive()
        if message.get("type") != "http.request":
            continue
        chunk = message.get("body", b"")
        total += len(chunk)
        if total > MAX_BODY_BYTES:
            raise ValueError("request body too large")
        chunks.append(chunk)
        if not message.get("more_body", False):
            break
    return b"".join(chunks)


def _rpc_error(req_id: Any, code: int, message: str) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "error": {"code": code, "message": message}}


def _rpc_result(req_id: Any, result: Any) -> dict[str, Any]:
    return {"jsonrpc": "2.0", "id": req_id, "result": result}


def _tool_result(payload: dict[str, Any]) -> dict[str, Any]:
    text = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return {
        "content": [{"type": "text", "text": text}],
        "structuredContent": payload,
        "isError": False,
    }


def _handle_rpc(request: dict[str, Any]) -> tuple[int, dict[str, Any] | None]:
    if request.get("jsonrpc") != "2.0":
        return 200, _rpc_error(request.get("id"), -32600, "Invalid Request")

    method = request.get("method")
    req_id = request.get("id")
    params = request.get("params") or {}

    if not isinstance(method, str):
        return 200, _rpc_error(req_id, -32600, "Invalid Request")

    if method.startswith("notifications/"):
        return 202, None

    if req_id is None:
        return 202, None

    if method == "initialize":
        requested = str(params.get("protocolVersion") or DEFAULT_PROTOCOL)
        protocol = requested if requested in SUPPORTED_PROTOCOLS else DEFAULT_PROTOCOL
        return 200, _rpc_result(
            req_id,
            {
                "protocolVersion": protocol,
                "capabilities": {"tools": {"listChanged": False}},
                "serverInfo": {"name": APP_NAME, "version": VERSION},
                "instructions": (
                    "This is the narrow read-only ChatGPT-facing surface of Universal AI Tool Hub. "
                    "It performs discovery and planning only and does not execute third-party actions."
                ),
            },
        )

    if method == "ping":
        return 200, _rpc_result(req_id, {})

    if method == "tools/list":
        return 200, _rpc_result(req_id, {"tools": _tools()})

    if method == "tools/call":
        name = params.get("name")
        arguments = params.get("arguments") or {}
        if not isinstance(name, str) or not isinstance(arguments, dict):
            return 200, _rpc_error(req_id, -32602, "Invalid tool arguments")
        try:
            payload = _call_tool(name, arguments)
        except KeyError:
            return 200, _rpc_error(req_id, -32602, "Unknown tool")
        return 200, _rpc_result(req_id, _tool_result(payload))

    return 200, _rpc_error(req_id, -32601, "Method not found")


async def _mcp(scope, receive, send) -> None:
    if not _request_allowed(scope):
        await _send_json(send, 421, {"status": "error", "error": "untrusted host or origin"})
        return

    method = scope.get("method", "GET").upper()
    if method != "POST":
        await _send_json(send, 405, {"status": "error", "error": "method not allowed"})
        return

    headers = _headers(scope)
    content_type = headers.get("content-type", "").lower()
    if "application/json" not in content_type:
        await _send_json(send, 415, {"status": "error", "error": "application/json required"})
        return

    try:
        raw = await _read_body(receive)
    except ValueError as exc:
        await _send_json(send, 413, {"status": "error", "error": str(exc)})
        return

    try:
        request = json.loads(raw.decode("utf-8"))
    except Exception:
        await _send_json(send, 200, _rpc_error(None, -32700, "Parse error"))
        return

    if not isinstance(request, dict):
        await _send_json(send, 200, _rpc_error(None, -32600, "Invalid Request"))
        return

    status, response = _handle_rpc(request)
    if response is None:
        await _send_bytes(send, status, b"", b"application/json; charset=utf-8")
    else:
        await _send_json(send, status, response)


async def _challenge(send) -> None:
    token = os.environ.get("OPENAI_APPS_CHALLENGE_TOKEN", "").strip()
    if not token:
        await _send_json(send, 404, {"status": "not_configured"})
        return
    await _send_bytes(send, 200, token.encode("utf-8"), b"text/plain; charset=utf-8")


def _page(title: str, body: str) -> bytes:
    return (
        "<!doctype html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
        f"<title>{html.escape(title)}</title></head><body><main>{body}</main></body></html>"
    ).encode("utf-8")


async def app(scope, receive, send) -> None:
    if scope.get("type") != "http":
        if scope.get("type") == "lifespan":
            while True:
                message = await receive()
                if message.get("type") == "lifespan.startup":
                    await send({"type": "lifespan.startup.complete"})
                elif message.get("type") == "lifespan.shutdown":
                    await send({"type": "lifespan.shutdown.complete"})
                    return
        return

    path = scope.get("path", "/")
    method = scope.get("method", "GET").upper()

    if path == "/mcp" or path == "/mcp/":
        await _mcp(scope, receive, send)
        return

    if path == "/.well-known/openai-apps-challenge" and method == "GET":
        await _challenge(send)
        return

    if method != "GET":
        await _send_json(send, 405, {"status": "error", "error": "method not allowed"})
        return

    if path == "/health":
        await _send_json(
            send,
            200,
            {"status": "ok", "service": APP_NAME, "version": VERSION, "tool_count": 5, "surface": "read_only_public"},
        )
        return

    if path in ("/", "/about"):
        body = _page(
            "Universal AI Tool Hub",
            "<h1>Universal AI Tool Hub</h1><p>ChatGPT public MCP surface.</p>"
            "<p>This surface is read-only and does not execute third-party actions.</p>"
            "<nav><a href='privacy'>Privacy</a> · <a href='terms'>Terms</a> · <a href='support'>Support</a></nav>",
        )
        await _send_bytes(send, 200, body, b"text/html; charset=utf-8")
        return

    if path == "/privacy":
        body = _page(
            "Privacy — Universal AI Tool Hub",
            "<h1>Privacy</h1><p>This public surface minimizes data collection. Its tools process only text or capability labels supplied for the current request and do not fetch private Hub account data or stored credentials.</p>"
            "<p>The hosting platform may receive standard network metadata needed to deliver HTTP requests. Do not submit secrets through public tool inputs.</p>",
        )
        await _send_bytes(send, 200, body, b"text/html; charset=utf-8")
        return

    if path == "/terms":
        body = _page(
            "Terms — Universal AI Tool Hub",
            "<h1>Terms</h1><p>This public surface provides read-only workflow discovery and planning. It does not execute third-party actions, make purchases, modify external data, or grant access to third-party services.</p>"
            "<p>Do not submit passwords, MFA codes, API keys, OAuth secrets, session cookies, or other credentials.</p>",
        )
        await _send_bytes(send, 200, body, b"text/html; charset=utf-8")
        return

    if path == "/support":
        repo = html.escape("https://github.com/yasinyasin2338-max/ARIA/issues")
        body = _page(
            "Support — Universal AI Tool Hub",
            f"<h1>Support</h1><p>For technical issues, use the public GitHub issue tracker:</p><p><a href='{repo}' rel='noopener noreferrer'>{repo}</a></p>"
            "<p>Never include passwords, MFA codes, API keys, access tokens, refresh tokens, client secrets, or payment information in a support issue.</p>",
        )
        await _send_bytes(send, 200, body, b"text/html; charset=utf-8")
        return

    await _send_json(send, 404, {"status": "not_found"})
