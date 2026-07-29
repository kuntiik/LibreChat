---
name: manage-desktop-flows
description: Manage and run Power Automate Desktop (RPA) flows and machine groups. Use when the user asks about desktop flows, RPA, or machine groups.
user-invocable: true
argument-hint: "[environment-id]"
allowed-tools:
  - list_environments_mcp_power-automate
  - set_current_env_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
  - list_desktop_flows_mcp_power-automate
  - run_desktop_flow_mcp_power-automate
  - list_machine_groups_mcp_power-automate
  - get_run_history_mcp_power-automate
  - get_run_details_mcp_power-automate
---

# Desktop Flow Manager

Manage Power Automate Desktop (RPA) flows, machine groups, and run sessions.

Tools are referred to by bare name; call them with the `_mcp_power-automate`
suffix.

| Tool | Purpose |
|------|---------|
| `list_desktop_flows` | Browse RPA flows (filter by `name`) |
| `run_desktop_flow` | Trigger with optional `machineGroup`, `body`, `timeout` |
| `list_machine_groups` | Browse machine infrastructure |

## Operations

### List Desktop Flows

Call `list_desktop_flows`. Present as a table: Name | Status | Created | Modified

### Run Desktop Flow

1. `list_desktop_flows` to find the flow (use the `name` filter if a name was
   given).
2. Optionally `list_machine_groups` to target a specific group.
3. `run_desktop_flow` with optional `machineGroup`, `body` (input data), and
   `timeout`.
4. Report session status (Waiting / InProgress / Failed / Cancelled /
   Succeeded) and outputs.

A desktop flow drives a real machine — confirm with the user before triggering
one that isn't obviously a test, and never fire a batch of them unprompted.

### Machine Infrastructure

Call `list_machine_groups`. Present: Name | Type | Status | Machines
