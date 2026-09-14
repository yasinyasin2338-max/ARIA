# Zero-Cost HTTPS Test Deployment — Render

Purpose: provide a **temporary/test** public HTTPS deployment path for the standalone ChatGPT-facing MCP without changing the existing Railway production Hub and without selecting a paid compute plan.

## Cost boundary

The repository Blueprint explicitly requests Render's `free` web-service compute plan and disables automatic deploys. Do not change `plan: free` to a paid plan without an explicit cost decision.

Render's own documentation says Free web services are intended for testing/hobby use and should not be treated as production hosting. They can spin down/restart and have other Free-plan limitations. Therefore this route is suitable for external protocol testing and OpenAI pre-submission checks, but it is **not automatically accepted as final production hosting**.

## Prepared files

- Root Blueprint: `render.yaml`
- Standalone image: `tts-pocket/Dockerfile.chatgpt-public`
- Service source: `tts-pocket/chatgpt_public_mcp.py`
- Health path: `/health`
- MCP path: `/mcp/`

The service also understands Render's automatically injected `RENDER_EXTERNAL_HOSTNAME`. That exact hostname is added to the MCP transport-security host/origin allowlist at process startup; the application does not trust an arbitrary request Host header.

## Blueprint safety properties

`render.yaml` is intentionally configured with:

- `runtime: docker`
- `plan: free`
- `healthCheckPath: /health`
- `autoDeployTrigger: off`
- the dedicated ChatGPT public Dockerfile/context only

No database, persistent disk, paid instance, API key, OpenAI credit, or provider secret is required for this read-only public test surface.

## Manual connection boundary

Creating a Render account/workspace or authorizing the Render connector is an external user-consent step. The engineering branch can be prepared without it. A service should only be created after the user connects Render and the creation request can be verified to remain on the Free plan.

## After a free test service exists

Verify the exact generated HTTPS hostname, then run all of the following against that deployed snapshot before using it for any OpenAI scan:

1. `GET /health` returns healthy status and five-tool count.
2. `/privacy`, `/terms`, `/support`, and `/about` return 200.
3. MCP `/mcp/` lists exactly the five approved read-only tools.
4. Tool annotations match the frozen spec.
5. The five positive and three negative reviewer cases pass.
6. No internal/admin Hub tools are visible.
7. `/.well-known/openai-apps-challenge` remains 404 until OpenAI supplies a real challenge token.

## Final hosting decision

Do not label a Render Free deployment as the final production release merely because it works technically. Final submission still depends on publisher verification, OpenAI's exact submission requirements at that time, and a stable hosting decision that does not violate the user's zero-cost constraint.
