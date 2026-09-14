import json
import os
import pwd
import grp
from pathlib import Path
from urllib.parse import parse_qs

DATA_DIR = Path(os.environ.get("UTH_DATA_DIR", "/app/data"))
USER = os.environ.get("UTH_RUNTIME_USER", "hub")
_UPSTREAM_APP = None


def _chown_tree(path: Path, uid: int, gid: int) -> None:
    path.mkdir(parents=True, exist_ok=True)
    os.chown(path, uid, gid)
    for root, dirs, files in os.walk(path):
        for name in dirs:
            try:
                os.chown(os.path.join(root, name), uid, gid)
            except FileNotFoundError:
                pass
        for name in files:
            try:
                os.chown(os.path.join(root, name), uid, gid)
            except FileNotFoundError:
                pass


def _patch_mobile_ui() -> None:
    """Patch v0.7.1 mobile navigation and deterministic OAuth handoff.

    The stock UI fetches ``/api/oauth/{provider}/start`` and then navigates to
    the returned authorization URL. On some mobile browsers that fetch can
    interact badly with the browser-friendly redirect wrapper. Replace the UI
    helper with an explicit top-level navigation carrying ``browser=1``. The
    ASGI wrapper recognizes that flag and converts the Hub JSON response into
    a same-request 302 for every OAuth provider.
    """
    path = Path("/app/app/static/app.js")
    if not path.exists():
        return
    text = path.read_text()
    changed = False

    nav_marker = "scrollIntoView({behavior:'smooth',block:'start'})"
    if nav_marker not in text:
        old_show = "function show(id){document.querySelectorAll('.pane').forEach(x=>x.classList.add('hidden'));$('#'+id).classList.remove('hidden');if(id==='connections')loadConnections();if(id==='approvals')loadApprovals();if(id==='models')loadModels();if(id==='agents')loadAgents();if(id==='workflows')loadWorkflows();if(id==='policies')loadPolicies();if(id==='jobs')loadJobs();if(id==='infra')loadInfra()}"
        new_show = "function show(id){document.querySelectorAll('.pane').forEach(x=>x.classList.add('hidden'));const pane=$('#'+id);pane.classList.remove('hidden');if(id==='connections')loadConnections();if(id==='approvals')loadApprovals();if(id==='models')loadModels();if(id==='agents')loadAgents();if(id==='workflows')loadWorkflows();if(id==='policies')loadPolicies();if(id==='jobs')loadJobs();if(id==='infra')loadInfra();requestAnimationFrame(()=>pane.scrollIntoView({behavior:'smooth',block:'start'}))}"
        if old_show not in text:
            raise RuntimeError("Hub navigation function signature changed; refusing blind patch")
        text = text.replace(old_show, new_show, 1)
        changed = True

    oauth_marker = "start?browser=1"
    if oauth_marker not in text:
        old_connect = "async function connectProvider(key){try{setConnectionMessage('در حال ساخت لینک OAuth...');const d=await api(`/api/oauth/${key}/start`);window.location.href=d.authorization_url}catch(e){setConnectionMessage(prettyError(e),true)}}"
        new_connect = "function connectProvider(key){setConnectionMessage('در حال انتقال به سرویس...');window.location.assign(`/api/oauth/${encodeURIComponent(key)}/start?browser=1`)}"
        if old_connect not in text:
            raise RuntimeError("Hub OAuth connect function signature changed; refusing blind patch")
        text = text.replace(old_connect, new_connect, 1)
        changed = True

    if changed:
        path.write_text(text)


def _is_browser_oauth_connect(scope) -> bool:
    if scope.get("type") != "http" or scope.get("method") != "GET":
        return False
    path = scope.get("path", "")
    if not (
        path.startswith("/api/oauth/")
        and (path.endswith("/connect") or path.endswith("/start"))
    ):
        return False

    query = parse_qs(scope.get("query_string", b"").decode("latin-1"))
    if query.get("browser") == ["1"]:
        return True

    headers = {k.lower(): v for k, v in scope.get("headers", [])}
    accept = headers.get(b"accept", b"").lower()
    return b"text/html" in accept


def _apply_csp(headers):
    patched = []
    for name, value in headers:
        if name.lower() == b"content-security-policy":
            text = value.decode("latin-1")
            old = "script-src 'self'; frame-ancestors 'none'"
            new = "script-src 'self'; script-src-attr 'unsafe-inline'; frame-ancestors 'none'"
            if old in text:
                text = text.replace(old, new, 1)
            value = text.encode("latin-1")
        patched.append((name, value))
    return patched


async def app(scope, receive, send):
    """Production wrapper for CSP and browser-friendly OAuth navigation."""
    global _UPSTREAM_APP
    if _UPSTREAM_APP is None:
        from connector_entry import app as connector_app
        _UPSTREAM_APP = connector_app

    if _is_browser_oauth_connect(scope):
        captured = []

        async def capture(message):
            captured.append(message)

        await _UPSTREAM_APP(scope, receive, capture)

        start = next((m for m in captured if m.get("type") == "http.response.start"), None)
        body = b"".join(m.get("body", b"") for m in captured if m.get("type") == "http.response.body")
        if start and start.get("status") == 200:
            try:
                payload = json.loads(body.decode("utf-8"))
                authorization_url = payload.get("authorization_url")
            except Exception:
                authorization_url = None
            if isinstance(authorization_url, str) and authorization_url.startswith(("https://", "http://")):
                await send({
                    "type": "http.response.start",
                    "status": 302,
                    "headers": [
                        (b"location", authorization_url.encode("utf-8")),
                        (b"cache-control", b"no-store"),
                    ],
                })
                await send({"type": "http.response.body", "body": b""})
                return

        for message in captured:
            if message.get("type") == "http.response.start":
                message = {**message, "headers": _apply_csp(message.get("headers", []))}
            await send(message)
        return

    async def send_with_csp(message):
        if message.get("type") == "http.response.start":
            message = {**message, "headers": _apply_csp(message.get("headers", []))}
        await send(message)

    await _UPSTREAM_APP(scope, receive, send_with_csp)


def main() -> None:
    _patch_mobile_ui()

    if os.geteuid() == 0:
        pw = pwd.getpwnam(USER)
        uid, gid = pw.pw_uid, pw.pw_gid
        _chown_tree(DATA_DIR, uid, gid)
        os.setgroups([])
        os.setgid(gid)
        os.setuid(uid)

    port = os.environ.get("PORT", "8000")
    os.execvp(
        "uvicorn",
        [
            "uvicorn",
            "secure_entrypoint:app",
            "--host",
            "0.0.0.0",
            "--port",
            port,
        ],
    )


if __name__ == "__main__":
    main()
