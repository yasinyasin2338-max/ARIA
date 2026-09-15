# Public ChatGPT MCP Surface — Frozen Initial Specification

Status: implementation target and review contract for `chatgpt-plugin-prep`. This branch does not change the existing production Hub by itself.

## Purpose

The ChatGPT-facing surface is deliberately smaller than the Hub's internal/admin surface. Its initial release is read-only and advisory. It provides Hub-owned workflow discovery and planning without acting as a generic relay to third-party services.

## Exact initial tool set

### `list_supported_workflows`
Returns the public workflow catalog. It does not expose the internal registry, admin tools, provider credentials, internal IDs, or debug traces.

### `find_workflow`
Inputs:
- `query`: bounded plain-language text.
- `limit`: bounded result count.

Searches only the in-process approved public workflow catalog. It performs no internet/provider search.

### `explain_workflow`
Input:
- `workflow_id`: bounded identifier that must match the public catalog.

Returns a user-safe explanation and explicit side-effect boundary. Unknown IDs return `not_found` and are never forwarded to an internal executor.

### `plan_workflow`
Input:
- `goal`: bounded plain-language text.

Returns an advisory sequence of reviewable steps. It does not execute a workflow, call a model provider, or modify external state.

### `check_workflow_requirements`
Inputs:
- `workflow_id`: supported public workflow identifier.
- `available_capabilities`: bounded list of capability labels supplied by the caller.

Compares only declared workflow requirements with the supplied labels. It does not inspect a Hub account, provider account, token store, OAuth connection, or external service.

## Required annotations for every initial tool

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: false`
- `idempotentHint: true`

If a future version adds a real external read, write, send, publish, delete, purchase, revoke, or other side effect, that capability must be represented by a new explicit tool with accurate annotations and its own security/review work. Do not silently expand these initial tools.

## Explicit exclusions

The public surface must not expose:

- generic `execute_tool` or arbitrary internal-tool dispatch,
- raw provider API passthrough,
- arbitrary URL fetch/relay,
- credential/token/password retrieval,
- OAuth app secrets,
- debug/admin endpoints,
- hidden tool inventory,
- subprocess/system/dynamic code execution,
- any mechanism intended to bypass provider terms, regional restrictions, rate limits, or access controls.

## Runtime boundaries

- Standalone FastAPI + MCP Streamable HTTP service.
- Canonical MCP URL path: `/mcp/` (trailing slash avoids framework redirect ambiguity).
- Public service pages: `/`, `/about`, `/privacy`, `/terms`, `/support`.
- Health endpoint: `/health`.
- OpenAI domain challenge endpoint: `/.well-known/openai-apps-challenge`, disabled with 404 until `OPENAI_APPS_CHALLENGE_TOKEN` is configured.
- DNS-rebinding protection enabled with an explicit host/origin allowlist; deployment may override with `PUBLIC_MCP_ALLOWED_HOSTS` and `PUBLIC_MCP_ALLOWED_ORIGINS`.
- Standard defensive HTTP headers are added to responses.

## Deployment separation

The existing protected/internal Hub remains independent. The ChatGPT public surface has a standalone Dockerfile (`tts-pocket/Dockerfile.chatgpt-public`) so it can be deployed without exposing internal/admin tools. Deploying it is a separate release decision and must not replace the existing v0.7.1 production service.

## Automated release gates

The GitHub workflow `.github/workflows/chatgpt-plugin-prep.yml` must pass all of the following on the final candidate commit:

1. Python compile checks.
2. Static public-surface safety checks.
3. HTTP health/legal/support/security-header checks.
4. Exact domain-challenge response check using a non-secret CI token.
5. MCP protocol E2E across the exact five-tool allowlist.
6. Reviewer-style positive and negative tool cases.
7. Production-host/origin transport-security simulation.
8. Standalone Docker build and non-root container smoke test.

No public deployment or submission should proceed from a commit that fails any gate.
