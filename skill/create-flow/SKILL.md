---
name: create-flow
description: Guided step-by-step wizard for creating a Power Automate flow, confirming the design with the user before anything is created. Use when the user wants to be walked through building a flow.
user-invocable: true
argument-hint: "[what the flow should do]"
allowed-tools:
  - list_environments_mcp_power-automate
  - set_current_env_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
  - list_connectors_mcp_power-automate
  - get_connector_mcp_power-automate
  - search_operations_mcp_power-automate
  - get_operation_details_mcp_power-automate
  - invoke_operation_mcp_power-automate
  - list_connections_mcp_power-automate
  - test_connection_mcp_power-automate
  - pick_or_create_connection_mcp_power-automate
  - resolve_refs_mcp_power-automate
  - resolve_params_mcp_power-automate
  - get_expression_help_mcp_power-automate
  - list_templates_mcp_power-automate
  - scaffold_flow_mcp_power-automate
  - validate_flow_mcp_power-automate
  - preflight_flow_mcp_power-automate
  - create_flow_mcp_power-automate
  - edit_flow_mcp_power-automate
  - publish_flow_mcp_power-automate
  - get_flow_mcp_power-automate
---

# Guided Flow Creation Wizard

Walk the user through creating a Power Automate flow step by step. Unlike
`build-flow`, this one checks in with the user at each decision — use it when
the requirements aren't fully pinned down yet.

Tools are referred to by bare name; call them with the `_mcp_power-automate`
suffix.

## Reference material

Read with `read_file` as needed:

- `references/definition-reference.md` — definition structure, triggers,
  actions, expressions, validation rules
- `references/connection-patterns.md` — connection discovery and reference
  format

## Steps

1. **Gather requirements**: ask what the flow should do. Identify the trigger,
   the actions, and the connectors involved. `$ARGUMENTS` may already contain a
   starting description.

2. **Select environment**: call `list_environments` (use `query` to filter).
   Present the options and let the user pick.

3. **Check for templates**: call `list_templates`. If a template matches
   (approval, digest, webhook, etc.), offer `scaffold_flow` as a starting point.

4. **Discover connectors**: for each connector, call `get_connector` with a
   `query` to find the operation, then `get_operation_details` for the exact
   parameters. **Never guess parameter names or types.**

5. **Verify connections**: call `list_connections` filtered by each connector
   and confirm Connected status. A missing connection needing OAuth consent has
   to be created by the user in the portal — surface that early rather than at
   the end.

6. **Resolve dynamic values**: for parameters annotated `dynamicValues` or
   `dynamicTree`, call `invoke_operation` to get the real values (Teams
   channels, SharePoint sites, etc.).

7. **Review with the user**: present the flow design — trigger, actions,
   connections — and get explicit confirmation before creating anything.

8. **Generate the definition** following all the rules:
   - Declare `$authentication` (SecureObject) and `$connections` (Object)
   - Use the correct action type from `get_operation_details`
     (`OpenApiConnection` or `OpenApiConnectionWebhook`)
   - Do NOT include `authentication` in action inputs
   - Use `Embedded` source in connection references
   - HTTP Request triggers require Premium; prefer `Button` kind

9. **Validate**: call `validate_flow`, and `preflight_flow` for a readiness
   check. Look up expression syntax with `get_expression_help` rather than
   guessing.

10. **Create**: call `create_flow` in Stopped state. Report the ID and name.

11. **Optionally publish**: ask whether the user wants it enabled. Only then
    call `publish_flow`. For later one-off tweaks use `edit_flow` (surgical)
    rather than resending the whole definition.
