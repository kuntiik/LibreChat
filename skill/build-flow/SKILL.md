---
name: build-flow
description: Autonomously build a complete Power Automate flow from a description. Use when you need to generate a full flow definition and create it.
user-invocable: true
argument-hint: "<description>"
allowed-tools:
  - list_environments_mcp_power-automate
  - set_current_env_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
  - list_flows_mcp_power-automate
  - get_flow_mcp_power-automate
  - get_flow_context_mcp_power-automate
  - set_current_flow_mcp_power-automate
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
  - update_flow_mcp_power-automate
  - preview_update_mcp_power-automate
  - publish_flow_mcp_power-automate
  - run_flow_mcp_power-automate
  - smoke_test_mcp_power-automate
---

# Flow Builder

Build a Power Automate flow from a description: discover the environment and
connections, generate a complete flow definition, create the flow, and
optionally publish it.

## Input

The user's flow description is: `$ARGUMENTS`

If that is empty, ask what the flow should do before doing anything else.

## Tools

Referred to by bare name below; call them with the `_mcp_power-automate` suffix
(`get_operation_details_mcp_power-automate`).

| Tool | Purpose |
|------|---------|
| `list_environments` | Find environments |
| `get_connector` | Get the operation index for a connector |
| `get_operation_details` | Exact parameter names, types, enums, and required action type |
| `list_connections` | Verify connections exist |
| `invoke_operation` | Resolve dynamic dropdown/tree values |
| `get_expression_help` | Look up Logic Apps expression functions + examples |
| `validate_flow` | Pre-flight definition check (offline rules) |
| `preflight_flow` | Multi-signal readiness check (missing refs, solution-wrap) |
| `create_flow` | Create the flow |
| `edit_flow` | Apply surgical action-level edits when iterating |
| `get_flow` | Verify creation |
| `publish_flow` | Enable the flow |
| `scaffold_flow` | Generate from a built-in template |

## Reference material

Read these with `read_file` when you need them — don't work from memory:

- `references/definition-reference.md` — required definition structure, trigger
  and action templates, expression syntax, validation rules, dynamic parameters
- `references/connection-patterns.md` — connection discovery, reference format,
  Embedded vs Invoker, the Dataverse special case

## Critical Rules

1. **ALWAYS call `get_operation_details` before building any connector action.**
   Never guess parameter names, enum values, or action types. It returns exact
   parameter names, types, allowed enum values, and the correct action type
   (`OpenApiConnection` vs `OpenApiConnectionWebhook`).

2. **Use the correct action type.** Standard operations use `OpenApiConnection`.
   Webhook operations (Approvals `StartAndWaitForAnApproval`, etc.) use
   `OpenApiConnectionWebhook`. `get_operation_details` returns this in
   `actionType`.

3. **Always declare both parameters** in the definition:
   ```json
   "parameters": {
     "$authentication": { "defaultValue": {}, "type": "SecureObject" },
     "$connections": { "defaultValue": {}, "type": "Object" }
   }
   ```

4. **Do NOT include `authentication` in action inputs.** The Flow API
   auto-injects it on save.

5. **Use `Embedded` source** in connection references. Never `Invoker`.

6. **HTTP Request triggers (`kind: "Http"`) require Premium.** Use
   `kind: "Button"` for free/seeded plans.

7. **Validate before creating.** Call `validate_flow` to catch errors before
   hitting the API.

## Workflow

1. **Discover environment**: call `list_environments`, using `query` to filter
   by name if the user specified one. If more than one plausibly fits, ask.

2. **Check for templates**: if the description matches a common pattern, call
   `list_templates` and `scaffold_flow` to start from a template rather than
   building from scratch.

3. **Look up connector operations**: for each connector the flow needs, call
   `get_connector` with a `query` to find the right operation — e.g.
   `get_connector(connector="shared_teams", query="post message")`.

4. **Get exact parameter specs**: call `get_operation_details` for each
   operation to get parameter names, types, enums, and the action type.

5. **Discover connections**: call `list_connections` filtered by each connector
   and verify at least one has Connected status. If a connection is missing and
   needs OAuth consent, stop and hand the user the consent URL or point them at
   make.powerautomate.com — consent cannot be completed from chat.

6. **Resolve dynamic values**: for parameters flagged `dynamicValues` or
   `dynamicTree` in `get_operation_details`, call `invoke_operation` to fetch
   the real values (Teams channels, SharePoint sites, etc.).

7. **Generate the definition** using the exact parameter names from step 4.
   There is no filesystem here — build the JSON inline and pass it to the tools
   directly.

8. **Validate**: call `validate_flow` (offline rules) and `preflight_flow`
   (missing refs, solution-wrap risk). Fix every reported error before
   continuing.

9. **Create the flow**: call `create_flow` in Stopped state.

10. **Iterate if needed**: to adjust one action or parameter after creation, use
    `edit_flow` with surgical operations rather than resending the whole
    definition.

11. **Report**: flow ID, name, state, and what still needs the user's hand
    (consent, publishing, a first test run).

Leave the flow Stopped unless the user asked for it live. Publishing puts a
freshly generated flow into production — confirm before calling `publish_flow`.

## Expression Syntax

Call `get_expression_help` (optionally with `query` or `category`) for the
validated function reference. Common patterns:

- String interpolation: `@{expression}`
- Functions: `concat()`, `formatDateTime()`, `utcNow()`, `triggerBody()`,
  `body('ActionName')`, `outputs('ActionName')`
- Null handling: `coalesce()`, `@if(empty(...), 'default', ...)`
- `result()` only works inside Scope/ForEach/Until/Switch actions
- `triggerBody()` may be null when the flow is triggered via the management API
  — wrap in `coalesce()`
