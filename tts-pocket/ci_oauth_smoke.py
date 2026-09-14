import asyncio
import base64
import hashlib
import json
import os
import urllib.error
import urllib.parse
import urllib.request

base = os.environ.get("CI_HUB_BASE", "http://127.0.0.1:18000").rstrip("/")
resource = base + "/mcp"
redirect_uri = "http://127.0.0.1:39123/callback"
password = os.environ["CI_TEST_PASSWORD"]
email = "admin@test.local"

class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None

no_redirect = urllib.request.build_opener(NoRedirect)

def get_json(path):
    with urllib.request.urlopen(base + path, timeout=10) as r:
        return r.status, json.loads(r.read().decode())

def post_json(path, payload):
    data = json.dumps(payload).encode()
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type":"application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=10) as r:
        return r.status, json.loads(r.read().decode())

def post_form(path, payload, opener=None, expect_redirect=False):
    data = urllib.parse.urlencode(payload).encode()
    req = urllib.request.Request(base + path, data=data, headers={"Content-Type":"application/x-www-form-urlencoded"}, method="POST")
    op = opener or urllib.request
    try:
        r = op.open(req, timeout=10) if hasattr(op, "open") else op.urlopen(req, timeout=10)
        return r.status, dict(r.headers), r.read().decode()
    except urllib.error.HTTPError as e:
        body = e.read().decode()
        if expect_redirect and e.code in (301, 302, 303, 307, 308):
            return e.code, dict(e.headers), body
        return e.code, dict(e.headers), body

s, meta = get_json("/.well-known/oauth-authorization-server")
assert s == 200
assert meta["authorization_endpoint"] == base + "/oauth/authorize"
assert meta["token_endpoint"] == base + "/oauth/token"
assert meta["registration_endpoint"] == base + "/oauth/register"
assert "S256" in meta["code_challenge_methods_supported"]
assert "authorization_code" in meta["grant_types_supported"]
assert "refresh_token" in meta["grant_types_supported"]
assert "offline_access" in meta["scopes_supported"]

s, prm = get_json("/.well-known/oauth-protected-resource")
assert s == 200
assert prm["resource"] == resource
assert base in prm["authorization_servers"]

s, client = post_json("/oauth/register", {
    "client_name": "CI MCP Client",
    "redirect_uris": [redirect_uri],
    "grant_types": ["authorization_code", "refresh_token"],
    "response_types": ["code"],
    "token_endpoint_auth_method": "none",
    "application_type": "native",
})
assert s == 201
client_id = client["client_id"]

verifier = "ci-verifier-" + ("A" * 52)
challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b"=").decode()
fields = {
    "response_type": "code",
    "client_id": client_id,
    "redirect_uri": redirect_uri,
    "code_challenge": challenge,
    "code_challenge_method": "S256",
    "scope": "hub:tools offline_access",
    "resource": resource,
    "state": "ci-state-1",
}

with urllib.request.urlopen(base + "/oauth/authorize?" + urllib.parse.urlencode(fields), timeout=10) as r:
    consent = r.read().decode()
    assert r.status == 200
    assert "تأیید اتصال" in consent

approve = dict(fields)
approve.update({"email": email, "password": password, "action": "approve"})
code_status, headers, _ = post_form("/oauth/authorize", approve, opener=no_redirect, expect_redirect=True)
assert code_status == 302
location = headers.get("Location") or headers.get("location")
assert location
qs = urllib.parse.parse_qs(urllib.parse.urlparse(location).query)
assert qs["state"][0] == "ci-state-1"
assert qs["iss"][0] == base
code = qs["code"][0]

token_payload = {
    "grant_type": "authorization_code",
    "code": code,
    "client_id": client_id,
    "redirect_uri": redirect_uri,
    "code_verifier": verifier,
    "resource": resource,
}
ts, _, tbody = post_form("/oauth/token", token_payload)
assert ts == 200, tbody
tok = json.loads(tbody)
assert tok.get("access_token")
assert tok.get("refresh_token")
refresh1 = tok["refresh_token"]

req = urllib.request.Request(base + "/api/tools", headers={"Authorization": "Bearer " + tok["access_token"]})
with urllib.request.urlopen(req, timeout=10) as r:
    assert r.status == 200
    tools = json.loads(r.read().decode())
    assert isinstance(tools, list)

async def mcp_end_to_end():
    try:
        import httpx2 as httpx_client
    except ImportError:
        import httpx as httpx_client
    from mcp import Client
    try:
        from mcp.client.streamable_http import streamable_http_client
    except ImportError:
        from mcp.client.streamable_http import streamablehttp_client as streamable_http_client

    async with httpx_client.AsyncClient(
        headers={"Authorization": "Bearer " + tok["access_token"]},
        timeout=httpx_client.Timeout(15.0, read=30.0),
    ) as http_client:
        transport = streamable_http_client(resource, http_client=http_client)
        async with Client(transport) as mcp_client:
            result = await mcp_client.list_tools()
            names = {tool.name for tool in result.tools}
            assert "search_tools" in names, names
            assert "list_tools" in names, names
            assert "execute_tool" in names, names
            assert "generate_with_model" in names, names
            assert len(names) >= 10, names

asyncio.run(mcp_end_to_end())
print("MCP_STREAMABLE_HTTP_E2E_OK")

rs, _, rbody = post_form("/oauth/token", token_payload)
assert rs == 400, rbody
assert json.loads(rbody)["error"] == "invalid_grant"

refresh_payload = {"grant_type":"refresh_token", "refresh_token":refresh1, "client_id":client_id, "resource":resource}
fs, _, fbody = post_form("/oauth/token", refresh_payload)
assert fs == 200, fbody
refreshed = json.loads(fbody)
refresh2 = refreshed.get("refresh_token")
assert refresh2 and refresh2 != refresh1

os_, _, obody = post_form("/oauth/token", refresh_payload)
assert os_ == 400, obody
assert json.loads(obody)["error"] == "invalid_grant"

bad = dict(refresh_payload)
bad["refresh_token"] = refresh2
bad["resource"] = base + "/wrong"
bs, _, bbody = post_form("/oauth/token", bad)
assert bs == 400, bbody
assert json.loads(bbody)["error"] == "invalid_target"

print("STAGING_OAUTH_E2E_OK")
