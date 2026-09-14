# Listing Draft — Universal AI Tool Hub

> Draft only. Final wording must match the exact reviewed MCP tool surface.

## Plugin name

Universal AI Tool Hub

## Short description

Run clearly defined AI and automation workflows through your Universal AI Tool Hub account.

## Long description

Universal AI Tool Hub provides a controlled workspace for discovering and running supported AI workflows from ChatGPT and Codex. The public plugin is intended to expose narrowly scoped Hub workflows with explicit permissions and predictable side effects. It does not expose credentials, raw provider tokens, hidden administrator controls, or unrestricted arbitrary-tool execution.

Users authenticate to their own Hub account. Each workflow should request only the information necessary for the requested task, and actions that change external state must be represented by explicit write/destructive tool metadata.

## Suggested category

Productivity / Developer Tools — choose the closest category available in the submission portal.

## Starter prompt ideas

- "Show me which Universal AI Tool Hub workflows are available to my account."
- "Check the status of my Hub connections without showing any credentials."
- "Find the best supported Hub workflow for this task and explain what it will do before running it."
- "Run a read-only Hub workflow for this task and summarize the result."

## Public URLs required before submission

- Website: **TBD**
- Support URL: **TBD**
- Privacy policy URL: **TBD**
- Terms URL: **TBD**

Recommended production-domain paths after engineering review:

- `https://aria-v4-production.up.railway.app/about`
- `https://aria-v4-production.up.railway.app/support`
- `https://aria-v4-production.up.railway.app/privacy`
- `https://aria-v4-production.up.railway.app/terms`

## Publisher identity

Must be selected from an identity verified in the OpenAI Platform. Do not submit under a name that does not match the verified publisher, website, support information, privacy policy, and terms.
