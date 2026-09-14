# Public ChatGPT MCP Surface — Initial Specification

Status: design target for the `chatgpt-plugin-prep` branch. This does not change production by itself.

## Design principles

The public ChatGPT-facing surface must be smaller and more reviewable than the Hub's internal/admin surface. It should expose explicit Hub-owned workflows, minimize returned data, and avoid a generic unrestricted relay into third-party services.

## Proposed initial tools

### `hub_list_capabilities`
Purpose: return a concise list of supported public Hub workflows and their requirements.

Annotations:
- readOnlyHint: true
- destructiveHint: false
- openWorldHint: false

Must not return credentials, provider tokens, internal IDs, debug traces, or hidden tool inventory.

### `hub_connection_status`
Purpose: report whether a supported provider/workflow is connected and usable for the current authorized Hub user.

Inputs:
- `provider_or_workflow`: constrained public enum/string

Annotations:
- readOnlyHint: true
- destructiveHint: false
- openWorldHint: false

Output is limited to states such as `connected`, `not_connected`, `needs_reauth`, or `unavailable`, plus a user-safe explanation.

### `hub_search_workflows`
Purpose: search the public catalog of Hub-owned workflows by user intent.

Inputs:
- `query`
- optional bounded `limit`

Annotations:
- readOnlyHint: true
- destructiveHint: false
- openWorldHint: false

This searches only the approved public workflow catalog; it must not reveal internal/admin tools.

### `hub_run_workflow`
Purpose: execute one explicitly approved Hub-owned workflow from a strict allowlist.

Inputs:
- `workflow_id`: must resolve to a public allowlisted workflow
- workflow-specific structured arguments

Annotations depend on each workflow and must be surfaced accurately. The generic entrypoint may only dispatch to workflows whose public metadata has already been approved; it may not accept arbitrary hidden tool IDs, URLs, code, provider method names, or raw credentials.

For write/destructive workflows, the public catalog must identify the side effect clearly and the server must enforce any confirmation/authorization boundary required by the workflow.

## Explicitly excluded from the public surface

- Generic `execute_tool` over the full internal registry.
- Raw provider API passthrough.
- Arbitrary URL fetch/relay on behalf of a user.
- Credential/token retrieval or display.
- Debug/admin endpoints.
- Provider setup secrets or OAuth app credentials.
- Hidden tool discovery that exposes internal connectors.
- Any workflow that circumvents provider terms, geographic restrictions, rate limits, or access controls.

## Server routing requirement

The public MCP endpoint should have a dedicated allowlist, independent from the internal/admin tool registry. A tool becoming available internally must not automatically make it public.

Recommended separation:
- Internal/admin MCP: existing protected Hub surface.
- Public ChatGPT MCP: dedicated route/module with only approved public tools.

## Response minimization

Every public result should return only the fields required for the user's task. Do not include bearer tokens, refresh tokens, cookies, OAuth codes, client secrets, authorization headers, request/session IDs, stack traces, database keys, or unrelated personal data.

## Testing gates before deployment

- Unknown workflow IDs are rejected.
- Internal tool IDs cannot be invoked through the public route.
- Credential-shaped fields are absent from successful and error responses.
- Read-only tools create no state changes.
- Write/destructive annotations match actual behavior.
- Authentication is required wherever user-specific data or actions are involved.
- Public tool schemas are stable and deterministic enough for reviewer test cases.
- Existing production/internal MCP behavior remains unchanged until a separate release decision.
