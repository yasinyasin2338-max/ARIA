# Privacy, Terms, and Support Requirements

This is an engineering/compliance checklist, not final legal advice.

## Privacy policy must clearly state

At minimum, the public policy should describe:

- Categories of personal data the Hub collects or processes.
- Why each category is needed.
- Categories of recipients or subprocessors, where applicable.
- Retention timelines or retention rules.
- User controls for disconnecting services, revoking access, deleting data, and contacting support.
- How OAuth credentials/tokens are handled without publishing secret values.
- Whether model providers or connected services receive user-supplied content when a user explicitly invokes a workflow that depends on them.
- That the public plugin does not intentionally return authentication secrets, debug traces, request IDs, or unrelated personal data in tool responses.

## Data-minimization requirements for MCP

Before public submission, inspect every tool's input and output schema and verify:

- Inputs request only data necessary for the specific task.
- Outputs return only data directly relevant to the user request.
- No access tokens, refresh tokens, API keys, passwords, client secrets, session cookies, or raw authorization headers are exposed.
- No internal request/trace/session identifiers are returned unless strictly necessary to fulfill the user request.
- No broad conversation transcript/history field is requested "just in case."
- Precise location is not requested unless the workflow genuinely requires it and the platform permits it.

## Terms should cover

- Service scope and supported workflows.
- User responsibility for connected third-party accounts and permissions.
- Prohibited misuse and attempts to bypass third-party restrictions, rate limits, or access controls.
- Availability, suspension, and service changes.
- Warranty/liability language appropriate to the publisher's jurisdiction.
- How users can terminate use and disconnect the Hub.
- Relationship between the Hub and independent third-party services.

## Support page should include

- A real support contact/channel controlled by the verified publisher.
- Basic troubleshooting for sign-in, authorization, connection status, and revocation.
- A privacy/deletion request route.
- A clear statement that users should never send passwords, MFA codes, API keys, or OAuth secrets to support chat.

## Publisher consistency

The publisher name, website, support contact, privacy policy, and terms should all match the same verified individual or business identity used in the OpenAI Platform submission.