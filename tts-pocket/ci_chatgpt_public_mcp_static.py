from pathlib import Path

p = Path(__file__).with_name("chatgpt_public_mcp.py")
text = p.read_text(encoding="utf-8")

required_tools = (
    "list_supported_workflows",
    "find_workflow",
    "explain_workflow",
    "plan_workflow",
    "check_workflow_requirements",
)
for name in required_tools:
    assert f"def {name}(" in text, name

for marker in (
    '"readOnlyHint": True',
    '"openWorldHint": False',
    '"destructiveHint": False',
    '"idempotentHint": True',
):
    assert marker in text, marker

for forbidden in (
    "execute_tool",
    "generic_execute",
    "client_secret",
    "access_token",
    "refresh_token",
    "api_key",
    "subprocess",
    "os.system",
    "os.popen",
    "eval(",
    "exec(",
):
    assert forbidden not in text, forbidden

for route in (
    '"/mcp"',
    '"/health"',
    '"/privacy"',
    '"/terms"',
    '"/support"',
    '"/.well-known/openai-apps-challenge"',
):
    assert route in text, route

assert "external_action_executed" in text
assert "credentials_returned" in text
assert "private_account_data_fetched" in text
assert "MAX_QUERY_CHARS" in text and "MAX_GOAL_CHARS" in text
assert "TransportSecuritySettings" in text
assert "PUBLIC_MCP_ALLOWED_HOSTS" in text
assert "PUBLIC_MCP_ALLOWED_ORIGINS" in text
assert "RENDER_EXTERNAL_HOSTNAME" in text
assert "PUBLIC_MCP_HOST" in text
assert "OPENAI_APPS_CHALLENGE_TOKEN" in text
assert "Cache-Control" in text
assert "X-Content-Type-Options" in text
assert "Referrer-Policy" in text
assert "Permissions-Policy" in text

print("CHATGPT_PUBLIC_MCP_STATIC_OK")
