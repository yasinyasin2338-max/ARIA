# Universal AI Tool Hub — Final Release Status

Verified release snapshot for the current stable runtime.

- Runtime version: 0.7.1
- Production branch: `hub-v071-deploy`
- Production merge commit: `54b2907e3b550fde582571c649deaef7d8b064ed`
- Railway service: `aria-v4`
- Railway deployment: `a214df2e-50e1-4a70-beb8-c87050dedb3e`
- Public Hub: `https://aria-v4-production.up.railway.app`
- MCP endpoint: `https://aria-v4-production.up.railway.app/mcp`
- Persistent volume mount: `/app/data`

## Verified core capabilities

- Auth boundary enabled
- OAuth 2.1-style authorization flow with PKCE/S256
- Protected-resource metadata and authorization-server discovery
- Rotating refresh-token flow and replay protections covered by smoke tests
- Streamable HTTP MCP end-to-end covered by smoke tests
- OpenRouter model gateway covered by smoke tests
- Mobile connector wizard and CSP boundary covered by smoke tests
- Runtime privilege drop covered by smoke tests
- Live production `/health` and `/ready` boundary covered by CI

## Connected providers

- GitHub
- Notion
- Slack
- Dropbox
- Atlassian

## Deferred external providers

- Google — deferred because legitimate supported account/region access was not available during setup.
- Microsoft — deferred because a usable Entra/Azure app registration environment was not available during setup.

These deferred providers are not blockers for the current Hub runtime.

## ChatGPT direct MCP

The Hub side is MCP-ready. Direct registration inside ChatGPT depends on the ChatGPT plan/workspace/client features available to the account and is external to this repository.

No secrets, OAuth authorization codes, access tokens, refresh tokens, client secrets, or passwords are included in this document.
