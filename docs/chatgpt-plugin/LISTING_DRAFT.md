# Listing Draft — Universal AI Tool Hub

> Draft for the initial read-only ChatGPT public surface. Final portal fields must match the exact deployed/scanned MCP snapshot and verified publisher identity.

## Plugin name

Universal AI Tool Hub

## Short description

Discover, understand, and safely plan supported Universal AI Tool Hub workflows from ChatGPT.

## Long description

Universal AI Tool Hub provides a narrow read-only ChatGPT surface for discovering supported Hub workflows, finding the best workflow for a goal, explaining workflow boundaries, creating advisory workflow plans, and checking declared workflow requirements from user-supplied capability labels.

The initial public surface does **not** execute third-party actions, modify external data, make purchases, send or publish content, fetch private Hub account data, or expose credentials. It does not provide unrestricted arbitrary-tool execution or raw provider passthrough.

This separation keeps the public ChatGPT experience predictable and reviewable while the broader internal Hub remains independent.

## Suggested category

Productivity / Developer Tools — select the closest category available in the submission portal.

## Starter prompt ideas

- "What workflows does Universal AI Tool Hub support?"
- "Find the best Hub workflow for this goal."
- "Explain what the plan-workflow capability does and whether it has side effects."
- "Create a safe advisory Hub plan for this task."
- "Check whether this workflow's declared requirements are satisfied by these capability labels."

## Planned public URLs

When the standalone public MCP is deployed, use URLs on the same reviewed public service/domain:

- Website: `<PUBLIC_BASE_URL>/about`
- Support: `<PUBLIC_BASE_URL>/support`
- Privacy: `<PUBLIC_BASE_URL>/privacy`
- Terms: `<PUBLIC_BASE_URL>/terms`
- MCP: `<PUBLIC_BASE_URL>/mcp/`
- Domain challenge: `<PUBLIC_BASE_URL>/.well-known/openai-apps-challenge`

Do not replace `<PUBLIC_BASE_URL>` with the existing protected Hub production URL unless the standalone public surface is actually deployed there and the exact routes are verified.

## Publisher identity

The displayed publisher must match the identity verified in the OpenAI Platform. The website, support, privacy, terms, and submission metadata must consistently represent that same publisher.

## Initial capability boundary

The initial listing must not imply that users can execute arbitrary providers, run the full internal Hub registry, or perform write/destructive actions. Those capabilities are intentionally outside the first public submission.
