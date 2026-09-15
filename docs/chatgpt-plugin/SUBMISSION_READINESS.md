# ChatGPT Plugin Submission Readiness — Universal AI Tool Hub

Status: **ENGINEERING PREP NEAR-COMPLETE — PUBLIC SUBMISSION BLOCKED BY EXTERNAL ACCOUNT/DEPLOYMENT GATES**

Existing Hub runtime: **0.7.1** on `hub-v071-deploy`.
Plugin-prep branch: **`chatgpt-plugin-prep`**.
The existing production Hub has not been replaced or modified by this branch.

## Completed engineering work

- Dedicated ChatGPT-facing MCP implementation is separate from the internal/admin Hub surface.
- Exact initial public tool set is frozen at five read-only/advisory tools:
  - `list_supported_workflows`
  - `find_workflow`
  - `explain_workflow`
  - `plan_workflow`
  - `check_workflow_requirements`
- No generic `execute_tool`, raw provider passthrough, arbitrary URL relay, credential retrieval, subprocess/system execution, or dynamic code execution is exposed by the public module.
- Tool annotations are explicitly read-only, non-destructive, closed-world, and idempotent.
- Inputs are bounded and unknown workflow IDs fail closed.
- Tool results explicitly state when no external action, credential return, or private-account fetch occurred.
- MCP uses Streamable HTTP on canonical path `/mcp/`.
- DNS-rebinding protection and explicit host/origin configuration are implemented.
- Public health, about, privacy, terms, and support routes are implemented in the standalone service.
- OpenAI domain-challenge route is implemented at `/.well-known/openai-apps-challenge` and remains disabled unless an environment token is configured.
- Standalone non-root Docker image is defined by `tts-pocket/Dockerfile.chatgpt-public`.
- GitHub CI compiles the code, runs static safety checks, starts the MCP server, checks public routes and security headers, exercises all five tools over MCP, runs negative cases, simulates the production host/origin, builds the standalone container, and smoke-tests it as a non-root user.
- Reviewer test-case document is aligned with the exact five-tool surface.
- Listing copy and zero-cost engineering plan are documented.

## Why the full internal Hub is not submitted directly

The broader Hub is a universal multi-provider connector/orchestration system. The public ChatGPT surface is intentionally narrower so the submitted app is explicit and reviewable rather than an unrestricted pass-through intermediary. The internal/admin Hub remains available only through its existing protected surface.

## Remaining gates before an actual OpenAI submission

### External/account gates

1. **Publisher verification:** the user's current OpenAI Platform organization UI requires a valid default payment method before individual verification can start. No payment method has been added as part of this project.
2. **Submission access:** the verified Platform organization must have the required app/plugin submission permission.
3. **Publisher identity fields:** the final displayed publisher name must match the verified identity.

### Public-release gates

4. **Public deployment:** deploy the standalone ChatGPT public MCP to a stable HTTPS URL without replacing the existing v0.7.1 Hub. Do not create a paid hosting resource merely to satisfy this step without an explicit cost decision.
5. **Final host/origin values:** set the deployed host in the transport-security allowlist and verify the exact public MCP URL.
6. **Domain challenge token:** when OpenAI supplies a challenge token, configure it only as an environment variable and verify the exact response.
7. **Final support/privacy identity:** choose a publisher-controlled support/privacy contact that is appropriate for public use. Do not publish a personal email automatically.
8. **Production logo:** provide the final listing logo required by the submission portal.
9. **Portal fields:** select final category and country/region availability in the submission UI.
10. **Final scan:** run OpenAI Scan Tools against the exact deployed MCP snapshot and compare the scanned tool list/annotations with this repository.
11. **Final reviewer run:** rerun the five positive and three negative cases against the exact deployed snapshot.

## Zero-cost boundary

No OpenAI API key, OpenAI API credit, ChatGPT Business subscription, or paid OpenAI model call is required by the plugin-prep code or CI. Any future action that can create a charge must remain a separate explicit decision.

## Release rule

Do **not** merge this preparation branch into the protected production branch merely to make the plugin public. The safest release model is a separate deployment of `Dockerfile.chatgpt-public`, followed by verification of the exact public URL. The current production v0.7.1 Hub should remain unchanged until a separately tested release decision is made.

## Definition of engineering-ready

The engineering package is considered ready for external submission steps only when the latest `ChatGPT Plugin Prep Check` run is green on the final branch head. Public submission itself cannot be called complete until publisher verification, stable HTTPS deployment, OpenAI tool scan, and review submission are actually completed.
