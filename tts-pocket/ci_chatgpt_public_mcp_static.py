from pathlib import Path

p = Path(__file__).with_name("chatgpt_public_mcp.py")
text = p.read_text(encoding="utf-8")

required_tools = (
    "list_supported_workflows",
    "find_workflow",
    "explain_workflow",
    "plan_workflow",
)
for name in required_tools:
    assert f"def {name}(" in text, name

for marker in (
    '"readOnlyHint": True',
    '"openWorldHint": False',
    '"destructiveHint": False',
):
    assert text.count(marker) >= len(required_tools), marker

for forbidden in (
    "execute_tool",
    "generic_execute",
    "client_secret",
    "access_token",
    "refresh_token",
    "api_key",
    "subprocess",
    "os.system",
):
    assert forbidden not in text, forbidden

assert "external_action_executed" in text
assert "credentials_returned" in text
assert 'app.mount(' in text and '"/mcp"' in text

print("CHATGPT_PUBLIC_MCP_STATIC_OK")
