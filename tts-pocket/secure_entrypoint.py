import os
import pwd
import grp
from pathlib import Path

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


def _patch_mobile_navigation() -> None:
    """Make section buttons visibly navigate on mobile.

    v0.7.1 toggles the requested pane but leaves the viewport where it was,
    which makes buttons such as «مدل‌ها» look broken on a phone. Patch the
    existing show() helper at container start so it also scrolls the selected
    pane into view. The replacement is idempotent.
    """
    path = Path("/app/app/static/app.js")
    if not path.exists():
        return
    text = path.read_text()
    if "scrollIntoView({behavior:'smooth',block:'start'})" in text:
        return
    old = "function show(id){document.querySelectorAll('.pane').forEach(x=>x.classList.add('hidden'));$('#'+id).classList.remove('hidden');if(id==='connections')loadConnections();if(id==='approvals')loadApprovals();if(id==='models')loadModels();if(id==='agents')loadAgents();if(id==='workflows')loadWorkflows();if(id==='policies')loadPolicies();if(id==='jobs')loadJobs();if(id==='infra')loadInfra()}"
    new = "function show(id){document.querySelectorAll('.pane').forEach(x=>x.classList.add('hidden'));const pane=$('#'+id);pane.classList.remove('hidden');if(id==='connections')loadConnections();if(id==='approvals')loadApprovals();if(id==='models')loadModels();if(id==='agents')loadAgents();if(id==='workflows')loadWorkflows();if(id==='policies')loadPolicies();if(id==='jobs')loadJobs();if(id==='infra')loadInfra();requestAnimationFrame(()=>pane.scrollIntoView({behavior:'smooth',block:'start'}))}"
    if old not in text:
        raise RuntimeError("Hub navigation function signature changed; refusing blind patch")
    path.write_text(text.replace(old, new, 1))


async def app(scope, receive, send):
    """Wrap the Hub ASGI app and narrowly allow inline event attributes.

    The v0.7.1 UI uses inline onclick handlers while the production CSP blocks
    all inline script. Keep inline <script> blocked, but allow script attributes
    so the existing mobile UI controls (login, navigation, actions) work.
    """
    global _UPSTREAM_APP
    if _UPSTREAM_APP is None:
        from connector_entry import app as connector_app
        _UPSTREAM_APP = connector_app

    async def send_with_csp(message):
        if message.get("type") == "http.response.start":
            headers = []
            for name, value in message.get("headers", []):
                if name.lower() == b"content-security-policy":
                    text = value.decode("latin-1")
                    old = "script-src 'self'; frame-ancestors 'none'"
                    new = "script-src 'self'; script-src-attr 'unsafe-inline'; frame-ancestors 'none'"
                    if old in text:
                        text = text.replace(old, new, 1)
                    value = text.encode("latin-1")
                headers.append((name, value))
            message = {**message, "headers": headers}
        await send(message)

    await _UPSTREAM_APP(scope, receive, send_with_csp)


def main() -> None:
    _patch_mobile_navigation()

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
