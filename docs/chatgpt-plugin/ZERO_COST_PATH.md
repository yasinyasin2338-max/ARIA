# Zero-Cost Path — ChatGPT Plugin Preparation

Goal: prepare Universal AI Tool Hub for a future ChatGPT plugin submission without requiring OpenAI API credits, ChatGPT Business, or any paid OpenAI API usage during the engineering/preparation phase.

## What can be done at zero OpenAI API cost

- Design and implement the ChatGPT-facing MCP surface.
- Keep the existing production Hub and private/internal MCP surface unchanged.
- Build explicit public tools with narrow purposes instead of exposing a generic third-party relay.
- Add MCP annotations, descriptions, schemas, and safety boundaries.
- Add automated tests for positive, negative, auth, privacy, and side-effect behavior.
- Prepare listing copy, support documentation, privacy policy, and terms text.
- Validate the public HTTPS/MCP endpoints using normal HTTP/MCP clients.
- Use GitHub CI for repository tests that do not call paid OpenAI APIs.
- Keep the submission branch separate from production until review-ready.

## Current cost blockers outside engineering

The OpenAI Platform account currently requires a valid default payment method before publisher verification can start. Publisher verification is needed for public ChatGPT app/plugin submission. This is an account/submission requirement, not a requirement to build the Hub or its MCP server.

Do not add OpenAI API credits or enable paid API usage merely to continue development.

## Cost guardrails for this repository

1. No OpenAI API key is required by the ChatGPT-plugin-prep branch.
2. No CI job should call a billable OpenAI API endpoint.
3. No production change should introduce a mandatory paid OpenAI dependency.
4. Existing provider integrations remain optional and must fail clearly when credentials or provider access are absent.
5. Any future step that can create a charge must be treated as a separate explicit decision.

## Practical plan

Phase A — free now:
- Define public MCP tools.
- Implement public-only routing/allowlist.
- Add schemas and annotations.
- Add tests and CI checks.
- Prepare legal/support/listing material.

Phase B — still free if infrastructure remains within existing free allowances:
- Deploy the public MCP surface alongside the current Hub.
- Test OAuth/MCP flows without OpenAI API calls.
- Run reviewer-style test cases.

Phase C — blocked only by OpenAI publisher verification/submission:
- Add a valid default payment method to the OpenAI Platform organization.
- Complete individual publisher verification.
- Submit the plugin/app for review.

Until Phase C, the engineering work remains useful and complete enough to be submission-ready later without redoing the Hub.
