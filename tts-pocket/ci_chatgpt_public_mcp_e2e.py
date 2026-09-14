import asyncio
import os

BASE = os.environ.get("CI_CHATGPT_PUBLIC_BASE", "http://127.0.0.1:18081").rstrip("/")
RESOURCE = BASE + "/mcp/"
PRODUCTION_HOST = "aria-v4-production.up.railway.app"


async def exercise_client(httpx_client, headers=None) -> None:
    from mcp import Client
    try:
        from mcp.client.streamable_http import streamable_http_client
    except ImportError:
        from mcp.client.streamable_http import streamablehttp_client as streamable_http_client

    async with httpx_client.AsyncClient(
        headers=headers or {},
        timeout=httpx_client.Timeout(15.0, read=30.0),
    ) as http_client:
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
            assert "private_account_data_fetched" in text, text

            result = await client.call_tool("plan_workflow", {"goal": "help me plan a workflow"})
            text = str(result).lower()
            assert "advisory_only" in text, text
            assert "external_action_executed" in text, text

            result = await client.call_tool(
                "check_workflow_requirements",
                {"workflow_id": "plan-workflow", "available_capabilities": []},
            )
            text = str(result).lower()
            assert "ready" in text, text
            assert "user_supplied_capability_labels_only" in text, text

            result = await client.call_tool("find_workflow", {"query": ""})
            assert "invalid_input" in str(result).lower(), result

            result = await client.call_tool("explain_workflow", {"workflow_id": "does-not-exist"})
            assert "not_found" in str(result).lower(), result


async def main() -> None:
    try:
        import httpx2 as httpx_client
    except ImportError:
        import httpx as httpx_client

    await exercise_client(httpx_client)
    await exercise_client(
        httpx_client,
        headers={
            "Host": PRODUCTION_HOST,
            "Origin": f"https://{PRODUCTION_HOST}",
        },
    )

    print("CHATGPT_PUBLIC_MCP_E2E_OK")


asyncio.run(main())
