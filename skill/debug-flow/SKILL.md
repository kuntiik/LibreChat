---
name: debug-flow
description: Debug a failed Power Automate flow run interactively - find the run, classify the root cause, propose a fix, and re-test. Use when a flow failed and the user wants it fixed.
user-invocable: true
argument-hint: "[flow-id] [run-id]"
allowed-tools:
  - power_automate_connect_account_mcp_power-automate
  - list_environments_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
  - list_flows_mcp_power-automate
  - get_flow_mcp_power-automate
  - get_flow_context_mcp_power-automate
  - get_run_history_mcp_power-automate
  - get_run_details_mcp_power-automate
  - get_run_actions_mcp_power-automate
  - get_run_action_repetitions_mcp_power-automate
  - get_past_trigger_inputs_mcp_power-automate
  - diagnose_run_mcp_power-automate
  - get_operation_details_mcp_power-automate
  - get_connector_mcp_power-automate
  - get_expression_help_mcp_power-automate
  - list_connections_mcp_power-automate
  - test_connection_mcp_power-automate
  - fix_connection_mcp_power-automate
  - validate_flow_mcp_power-automate
  - preflight_flow_mcp_power-automate
  - preview_update_mcp_power-automate
  - edit_flow_mcp_power-automate
  - update_flow_mcp_power-automate
  - run_flow_mcp_power-automate
  - resubmit_run_mcp_power-automate
  - cancel_run_mcp_power-automate
  - list_backups_mcp_power-automate
  - get_backup_mcp_power-automate
  - restore_backup_mcp_power-automate
---

# Debug a Failed Flow Run

Help the user debug a failed Power Automate flow run.

Tools are referred to by bare name; call them with the `_mcp_power-automate`
suffix (`diagnose_run_mcp_power-automate`).

## Reference material

Read with `read_file`:

- `references/error-troubleshooting.md` — error-code → cause → fix table and the
  diagnostic tool order
- `references/definition-reference.md` — definition rules, so you can tell a
  broken definition from a broken connection

| Tool | Purpose |
|------|---------|
| `list_flows` | Find flows by name (use the `name` param) |
| `get_run_history` | Recent runs for a flow |
| `diagnose_run` | One-shot: classify failed actions with remediations |
| `get_run_details` | Details for a specific run |
| `get_run_actions` | Action-level execution trace |
| `get_run_action_repetitions` | Iteration detail for a loop — pass an action **inside** the loop |
| `get_flow` | Flow definition for context |
| `get_operation_details` | Confirm the correct action type / parameters |
| `edit_flow` | Surgical fix to one action/parameter |
| `update_flow` | Replace the whole definition (large rewrites) |
| `run_flow` | Re-run after the fix (`wait: true` to see the result) |
| `resubmit_run` / `cancel_run` | Resubmit a fixed run / cancel a stuck one |

## Steps

1. **Identify the flow and run**
   - Parse `$ARGUMENTS` for a flow ID and optional run ID.
   - No flow ID? Call `list_flows` with the `name` param to search. Ask the user
     to pick if ambiguous.
   - No run ID? Call `get_run_history` and find the most recent failed run.
   - Present recent runs: Run ID | Status | Start Time | Error

2. **Fast triage with `diagnose_run`**
   - It returns the failed and timed-out actions already classified, each with a
     remediation. Start there.
   - For deeper analysis also fetch `get_run_actions` (full trace) and
     `get_flow` (definition context). For a failed loop, call
     `get_run_action_repetitions` on an action **inside** the loop to find the
     failing iteration.

3. **Analyze failures**
   - Identify actions with status != Succeeded.
   - Trace the `runAfter` dependency chain to separate root cause from cascade:
     - **Root cause** — dependencies all Succeeded, but this action failed
     - **Cascading** — skipped because a dependency failed
   - Report root-cause actions with name, type, error code, error message.

4. **Root cause classification**
   - **Connection errors** (`AuthorizationFailed`, `ConnectionNotFound`,
     `InvokerConnectionOverrideFailed`) — re-auth, or fix the connection source
     to Embedded
   - **Expression errors** (`ExpressionEvaluationFailed`, `InvalidTemplate`) —
     show the expression, explain what's wrong, propose the fix
   - **API / external errors** (401/403/404/429/500+) — explain the HTTP error,
     check connector status
   - **Parameter errors** (`WorkflowOperationParametersRuntimeMissingValue`) —
     missing or empty required parameter; add a null guard
     `@if(empty(...), 'default', ...)`
   - **Timeout** (`ActionTimedOut`) — retry policy, or split the operation
   - **Type mismatch** (`InvalidOpenApiConnectionOperationType`) — wrong action
     type; call `get_operation_details` for the correct one

5. **Suggest the fix**
   - Give a specific fix with the exact expression or parameter change.
   - If it's a definition change, offer to apply it with `edit_flow` (surgical,
     one action or parameter). Fall back to `update_flow` only for large
     rewrites. Get the user's go-ahead before writing to a live flow.

6. **Re-test**
   - Offer `run_flow` with `wait: true` to verify, or `resubmit_run` to retry
     the original run with its trigger inputs.
   - Report the result: Succeeded/Failed with action details.

Report what the run actually shows. If the trace doesn't identify a root cause,
say the evidence is inconclusive and name what's missing — don't present a
plausible guess as the diagnosis.

## Output Format

### Diagnosis Summary
- **Flow**: [name] ([ID])
- **Run**: [run ID] | [start time] | Status: **[status]**

### Failed Actions
| # | Action | Status | Error Code | Error Message |
|---|--------|--------|------------|---------------|

### Root Cause
[Classification]: [Explanation]

### Fix
[Step-by-step fix with the concrete change]
