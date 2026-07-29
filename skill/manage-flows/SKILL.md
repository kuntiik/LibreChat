---
name: manage-flows
description: Manage flow lifecycle - publish, test, batch operations, inventory reports, health checks, and runaway-run incident response. Use when the user asks to publish, test, batch manage, or get an inventory of flows.
user-invocable: true
argument-hint: "<operation> [flow-ids...]"
allowed-tools:
  - power_automate_connect_account_mcp_power-automate
  - list_environments_mcp_power-automate
  - set_current_env_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
  - list_flows_mcp_power-automate
  - get_flow_mcp_power-automate
  - get_flow_context_mcp_power-automate
  - set_current_flow_mcp_power-automate
  - clear_current_flow_mcp_power-automate
  - publish_flow_mcp_power-automate
  - disable_flow_mcp_power-automate
  - delete_flow_mcp_power-automate
  - copy_flow_mcp_power-automate
  - run_flow_mcp_power-automate
  - smoke_test_mcp_power-automate
  - get_run_history_mcp_power-automate
  - get_run_details_mcp_power-automate
  - get_run_actions_mcp_power-automate
  - cancel_run_mcp_power-automate
  - cancel_all_runs_mcp_power-automate
  - resubmit_run_mcp_power-automate
  - diagnose_run_mcp_power-automate
  - list_connections_mcp_power-automate
  - test_connection_mcp_power-automate
  - list_backups_mcp_power-automate
  - get_backup_mcp_power-automate
  - restore_backup_mcp_power-automate
---

# Flow Lifecycle Manager

Flow lifecycle operations: publish-and-test, batch operations, inventory
reports, health checks, and incident response.

Tools are referred to by bare name; call them with the `_mcp_power-automate`
suffix.

## Confirm before destructive work

`delete_flow`, `disable_flow`, and `cancel_all_runs` affect live business
automation. Before calling any of them, list the exact flows by name and ID and
get an explicit go-ahead. Never expand a vague instruction ("clean up the old
ones") into a batch delete — resolve it to a named list first.

## Capabilities

### 1. Publish-and-Test Cycle

1. Call `publish_flow` to enable the flow.
2. Call `run_flow` with `wait: true` and `timeout: 30` to trigger it and wait
   for completion.
3. Report pass/fail, duration, and action statuses.

### 2. Batch Operations

For multiple flows (IDs from `$ARGUMENTS` or from `list_flows`):

- **Batch disable** — `disable_flow` per flow
- **Batch delete** — `delete_flow` per flow, after the confirmation above
- **Batch publish** — `publish_flow` per flow

Report per-item success/failure; don't abort the batch on the first error.

### 3. Inventory Report

1. `list_environments` to get environments.
2. `list_flows` on each (or the specified) environment.
3. Summarise: flow counts by state, trigger types, recent modifications.

### 4. Health Check

For each flow in an environment:

1. `get_run_history` with `top: 5`
2. Count Succeeded vs Failed runs
3. Flag flows with a >50% failure rate

Report: flow name, success rate, last run status, last failure error. Hand
anything that needs real analysis to the `debug-flow` skill.

### 5. Incident Response (runaway runs)

When a flow is misfiring with many queued runs:

1. `cancel_all_runs` bulk-cancels every Running/Waiting run (Dataverse bulk
   action for solution and modern non-solution flows, per-run fallback
   otherwise). Pass `turnOff: true` to also disable the flow while the root
   cause is fixed.
2. After fixing, `resubmit_run` the affected runs. Only self-invoked runs are
   resubmittable, per Power Automate policy.
