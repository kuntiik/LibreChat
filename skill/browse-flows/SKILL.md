---
name: browse-flows
description: Browse Power Automate environments and flows interactively. Use when the user wants to browse, list, or explore their flows and environments.
user-invocable: true
argument-hint: "[environment-id]"
allowed-tools:
  - list_environments_mcp_power-automate
  - set_current_env_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
  - list_flows_mcp_power-automate
  - get_flow_mcp_power-automate
  - get_run_history_mcp_power-automate
  - get_run_details_mcp_power-automate
  - get_run_actions_mcp_power-automate
  - list_connections_mcp_power-automate
  - list_connectors_mcp_power-automate
  - get_connector_mcp_power-automate
  - get_flow_context_mcp_power-automate
  - set_current_flow_mcp_power-automate
  - clear_current_flow_mcp_power-automate
---

# Browse Environments and Flows

Interactive skill for discovering Power Automate environments and flows.

Tools are referred to below by bare name; call them with the
`_mcp_power-automate` suffix (`list_flows_mcp_power-automate`).

## Steps

1. **Resolve environment**
   - If `$ARGUMENTS` contains an environment ID, use it.
   - Otherwise call `list_environments` (pass `query` to filter if the user
     mentioned a name).
   - If several environments match, list them and ask the user which one — do
     not pick silently.

2. **List flows**: call `list_flows` on the selected environment. Use the `name`
   param when the user is looking for something specific.

3. **Present results** in a table:

   | # | Name | State | Trigger | Actions | Last Modified |
   |---|------|-------|---------|---------|---------------|

4. **Offer next steps**, naming the concrete tool or skill:
   - View flow details — `get_flow`
   - Check run history — `get_run_history`
   - Debug a failed flow — the `debug-flow` skill
   - Create a new flow — the `create-flow` skill

Keep the listing read-only. If the user asks to change, publish, disable, or
delete anything, switch to `manage-flows` rather than acting from here.
