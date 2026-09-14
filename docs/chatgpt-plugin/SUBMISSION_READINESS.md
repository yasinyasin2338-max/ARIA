# ChatGPT Plugin Submission Readiness — Universal AI Tool Hub

Status: **PREPARATION ONLY — NOT READY FOR PUBLIC SUBMISSION YET**

Runtime version: **0.7.1**
Production MCP URL: `https://aria-v4-production.up.railway.app/mcp`

## What is already in good shape

- Public production HTTPS endpoint exists.
- MCP Streamable HTTP is exercised by CI.
- OAuth authorization-code flow with PKCE S256 is implemented.
- Refresh-token rotation and replay rejection are tested.
- OAuth protected-resource metadata is published for the MCP resource.
- Anonymous access to protected APIs is rejected.
- Production health/readiness checks are in place.
- Provider setup UI uses an external script with a restrictive CSP.

## OpenAI public-plugin requirements still to satisfy

1. **Verified publisher identity** in the OpenAI Platform (individual or business).
2. **Apps Management / plugin submission write permission** for the submitting Platform organization.
3. **Public listing materials**: plugin name, short description, long description, production logo, category, website, support URL, privacy-policy URL, terms URL.
4. **Accurate MCP tool metadata** for every exposed tool, including `readOnlyHint`, `openWorldHint`, and `destructiveHint`.
5. **Five positive test cases and three negative test cases** with deterministic expected behavior.
6. **Reviewer-ready authentication**. If review requires a demo account, it must work without MFA, SMS, email confirmation, or private-network access.
7. **Domain verification** if the submission portal requests it, using the OpenAI challenge path on the production domain.
8. **Privacy minimization audit** of every tool response. Do not return auth secrets, debug payloads, session/trace/request identifiers, or unrelated personal data.
9. **Country/region availability** must be selected deliberately.
10. If UI resources are attached to MCP tools, their CSP must list only the exact domains they fetch from.

## Critical policy risk discovered

The current Hub is designed as a universal connector/orchestration layer over multiple third-party services. OpenAI's current plugin guidelines say that plugins that primarily function as unofficial connectors to third-party services, including pass-through intermediary software layers, cannot be approved. The same guidelines also require authorized access to third-party APIs and prohibit circumvention of provider restrictions.

Because of that, the current full Hub surface should **not** be submitted unchanged. A public-directory version should expose a narrower, clearly first-party workflow surface whose main value is the Hub's own orchestration logic, not a generic relay to arbitrary third-party services. Any third-party capability included in the public version needs a defensible authorization/terms basis and narrowly scoped permissions.

## Recommended public-plugin shape

Create a dedicated **ChatGPT-facing MCP surface** for the Hub, separate from the unrestricted internal/admin surface. The public surface should initially expose only clearly reviewable Hub-owned capabilities, for example:

- Discover supported Hub workflows.
- Inspect a user's Hub connection status without returning credentials.
- Run explicitly defined Hub workflows with clear side-effect boundaries.
- Generate/model-route through the Hub only where provider terms permit this use.
- Return minimal, task-specific results.

Avoid exposing a generic `execute_tool` that can invoke arbitrary hidden third-party actions in the public listing. Prefer explicit, human-readable tools with one purpose each.

## Next engineering work

- Inventory every production MCP tool and classify it as read-only / write / destructive / open-world.
- Split admin/internal tools from public plugin tools.
- Replace generic tool relay operations on the public surface with explicit workflow tools.
- Add complete MCP annotations and reviewer-safe descriptions.
- Add public privacy, terms, support, and website pages under the production domain.
- Add plugin-specific automated checks to CI.
- Only after those checks pass, create a draft in the OpenAI plugin submission portal and run **Scan Tools**.

## Important

This branch is intentionally separate from production. Nothing in this preparation document changes the currently deployed v0.7.1 runtime.