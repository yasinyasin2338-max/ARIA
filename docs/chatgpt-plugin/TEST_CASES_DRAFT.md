# Reviewer Test Cases — ChatGPT Public MCP

Status: engineering-ready draft for the exact read-only public surface in `tts-pocket/chatgpt_public_mcp.py`.

The public surface currently exposes exactly five tools and performs no third-party action, account lookup, purchase, write, deletion, or credential retrieval.

## Positive cases

1. **List supported workflows**
   - Tool: `list_supported_workflows`
   - Input: none.
   - Expected: status `ok`; returns only the public workflow catalog; includes `external_action_executed: false`; no hidden/admin tool inventory or credentials.

2. **Find a workflow for a user goal**
   - Tool: `find_workflow`
   - Input: `query = "plan a safe workflow"`, bounded `limit`.
   - Expected: status `ok`; `plan-workflow` appears among matches; no external action is executed.

3. **Explain a supported workflow**
   - Tool: `explain_workflow`
   - Input: `workflow_id = "plan-workflow"`.
   - Expected: status `ok`; side effects are explicitly `none`; `credentials_returned`, `private_account_data_fetched`, and `external_action_executed` are false.

4. **Create an advisory workflow plan**
   - Tool: `plan_workflow`
   - Input: a short plain-language goal.
   - Expected: status `advisory_only`; returns a small reviewable sequence of steps and a supported workflow recommendation; does not contact an external service.

5. **Check declared workflow requirements**
   - Tool: `check_workflow_requirements`
   - Input: a supported `workflow_id` plus user-supplied capability labels.
   - Expected: returns `ready` or `missing_requirements` based only on the supplied labels and the public workflow definition; source is `user_supplied_capability_labels_only`; no private account data is fetched.

## Negative cases

1. **Empty workflow-search query**
   - Tool: `find_workflow`
   - Input: empty query.
   - Expected: `invalid_input`; no fallback external search or hidden-tool discovery occurs.

2. **Unknown workflow ID**
   - Tool: `explain_workflow` or `check_workflow_requirements`
   - Input: `workflow_id = "does-not-exist"`.
   - Expected: `not_found`; the server does not route the unknown ID into an internal registry or generic executor.

3. **Credential/arbitrary-action request**
   - User intent: request stored OAuth tokens, API keys, passwords, hidden tools, arbitrary URLs, or an unlisted provider action.
   - Expected: no public tool exists that can retrieve or execute those requests. The exact scanned tool list remains the five explicit read-only tools above.

## Metadata checks

Every public tool must advertise:

- `readOnlyHint: true`
- `destructiveHint: false`
- `openWorldHint: false`
- `idempotentHint: true`

## Automated coverage

`tts-pocket/ci_chatgpt_public_mcp_e2e.py` executes all five positive protocol paths plus the first two negative cases. `tts-pocket/ci_chatgpt_public_mcp_static.py` verifies that generic execution, credential-shaped implementation markers, system/subprocess execution, and unsafe dynamic execution are absent from the public module.

Before submission, rerun these cases against the exact public HTTPS MCP URL scanned by OpenAI. If the public tool set changes, update this document and the automated tests before submission.
