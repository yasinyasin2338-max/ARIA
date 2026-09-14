import asyncio
import os

BASE = os.environ.get("CI_HUB_BASE", "http://127.0.0.1:18000").rstrip("/")
RESOURCE = BASE + "/chatgpt-public/mcp"


async def main() -> None:
    import httpx
    from mcp import Client
    try:
        from mcp.client.streamable_http import streamable_http_client
    except ImportError:
        from mcp.client.streamable_http import streamablehttp_client as streamable_http_client

    async with httpx.AsyncClient(timeout=httpx.Timeout(15.0, read=30.0)) as http_client:
        transport = streamable_http_client(RESOURCE, http_client=http_client)
        async with Client(transport) as client:
            listed = await client.list_tools()
            tools = {tool.name: tool for tool in listed.tools}
            expected = {
                "list_supported_workflows",
                "find_workflow",
                "explain_workflow",
                "plan_workflow",
                "check_workflow_requirements",
            }
            assert set(tools) == expected, set(tools)

            for name, tool in tools.items():
                annotation_text = repr(tool.annotations).lower()
                assert "true" in annotation_text, (name, annotation_text)
                assert "false" in annotation_text, (name, annotation_text)

            result = await client.call_tool("list_supported_workflows", {})
            text = str(result).lower()
            assert "discover-capabilities" in text, text
            assert "external_action_executed" in text, text

            result = await client.call_tool("find_workflow", {"query": "plan a safe workflow", "limit": 3})
            text = str(result).lower()
            assert "plan-workflow" in text, text
            assert "external_action_executed" in text, text

            result = await client.call_tool("explain_workflow", {"workflow_id": "plan-workflow"})
            text = str(result).lower()
            assert "side_effects" in text and "none" in text, text

            result = await client.call_tool("plan_workflow", {"goal": "help me plan a workflow"})
            text = str(result).lower()
            assert "advisory_only" in text, text

            result = await client.call_tool(
                "check_workflow_requirements",
                {"workflow_id": "plan-workflow", "available_capabilities": []},
            )
            text = str(result).lower()
            assert "ready" in text, text
            assert "user_supplied_capability_labels_only" in text, text

    print("CHATGPT_PUBLIC_BRIDGE_E2E_OK")


asyncio.run(main())
