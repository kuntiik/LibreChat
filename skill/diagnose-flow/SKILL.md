---
name: diagnose-flow
description: Deep autonomous failure analysis of a Power Automate run - execution graph, root cause vs cascade, and a written diagnosis report with a confidence level. Use for a thorough post-mortem rather than an interactive fix.
user-invocable: true
argument-hint: "<environment-id> <flow-id> <run-id>"
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
  - validate_flow_mcp_power-automate
  - preflight_flow_mcp_power-automate
  - preview_update_mcp_power-automate
  - edit_flow_mcp_power-automate
  - update_flow_mcp_power-automate
---

# Deep Flow Diagnostic

Given environment, flow, and run IDs, perform a comprehensive failure analysis
and write it up. Use `debug-flow` instead when the user wants an interactive
fix-and-retest loop.

Tools are referred to by bare name; call them with the `_mcp_power-automate`
suffix.

## Input

Parse `$ARGUMENTS` for environment ID, flow ID, and run ID. Resolve whatever is
missing with `resolve_environment`, `list_flows`, and `get_run_history` before
starting.

## Reference material

Read with `read_file`:

- `references/error-troubleshooting.md` — error-code table and diagnostic order
- `references/definition-reference.md` — definition rules for the
  cross-reference step

## Workflow

1. **Triage with `diagnose_run`**, then gather full context in parallel:
   - `diagnose_run` — classified failed/timed-out actions with a remediation
     each (start here)
   - `get_run_details` — overall run status
   - `get_run_actions` — full action-level execution trace
   - `get_flow` — definition context
   - For a failed loop, `get_run_action_repetitions` on an action **inside** the
     loop (the container returns none) to find the failing iteration

2. **Build the execution graph**: map each action's `runAfter` dependencies.
   Identify parallel branches.

3. **Identify failed actions**: filter for status != Succeeded and classify each:
   - **Root failure** — dependencies all Succeeded but this action failed
   - **Cascading skip** — skipped because a dependency failed

4. **Analyze each root failure** against the common patterns:
   - Authorization / connection errors
   - Expression evaluation failures
   - HTTP 4xx/5xx from external services
   - Timeouts
   - Parameter validation failures (empty required fields, wrong enum values)
   - Action type mismatches (`OpenApiConnection` vs `OpenApiConnectionWebhook`)

5. **Cross-reference with the definition**: check whether the action's
   parameters, connection references, or expressions show the problem in
   `get_flow` output.

6. **Write the diagnosis report**:
   - Execution timeline
   - Root cause identification
   - Specific fix with the concrete change
   - **Confidence level** (high / medium / low), and say plainly what evidence
     is missing when it isn't high

7. **Optionally generate the fix**: if it's a definition change, apply it with
   `edit_flow` (surgical, one action or parameter) — `update_flow` only for
   large rewrites, and only with the user's explicit go-ahead. `preview_update`
   shows the diff first.
