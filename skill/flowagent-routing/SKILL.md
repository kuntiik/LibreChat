---
name: flowagent-routing
description: Baseline routing and hard rules for the Power Automate (FlowAgent) MCP tools. Always applied so every Power Automate request uses the MCP surface correctly.
always-apply: true
disable-model-invocation: true
user-invocable: false
---

# Power Automate (FlowAgent) — tool routing

## Use the MCP tools

If tools ending in `_mcp_power-automate` are present in your tool surface, **use
them** for every flow, environment, connection, connector, and run operation:
list / get / create / update / **edit** / **copy** / publish / run flows,
environments, connections, connectors, run history and run management (**cancel**,
**cancel_all**, **resubmit**, **diagnose**, loop repetitions), dynamic resolvers,
templates, and `get_expression_help`.

Tools are named `<tool>_mcp_power-automate` — e.g. `list_flows_mcp_power-automate`.
Skills and reference docs refer to them by bare name (`list_flows`); append the
suffix when you actually call them.

The MCP server handles authentication, session-scoped current environment and
flow, and structured errors. Every user is connected as **themselves** — the
bridge keys a separate Azure login per LibreChat user, so a tool call acts with
that person's own Power Automate permissions. Never claim an operation succeeded
for someone else's flows on the basis of your own access.

There is **no shell, no `az` CLI, and no local filesystem** in this deployment.
Anything the MCP surface does not wrap (connection consent, sharing, solution
and admin operations) must be done by the user in the Power Automate portal —
say so and point them at [make.powerautomate.com](https://make.powerautomate.com)
rather than inventing a command.

If the `_mcp_power-automate` tools are missing entirely, the server is not
connected for this user. Tell them to open the MCP server list and connect
**power-automate**; do not attempt a workaround.

## Hard rules when writing a flow definition

These are non-negotiable and cause silent runtime failures when broken:

1. **Call `get_operation_details` before building any connector action.** Never
   guess parameter names, enum values, or action types.
2. Standard operations use `"type": "OpenApiConnection"`. Webhook operations
   (Approvals `StartAndWaitForAnApproval`, etc.) use `"OpenApiConnectionWebhook"`.
   `get_operation_details` returns the right one in `actionType`.
3. Always declare both parameters:
   ```json
   "parameters": {
     "$authentication": { "defaultValue": {}, "type": "SecureObject" },
     "$connections": { "defaultValue": {}, "type": "Object" }
   }
   ```
4. **Never** put `authentication` inside action inputs — Power Automate injects
   it on save.
5. Connection references use `"source": "Embedded"`. Never `Invoker`.
6. HTTP Request triggers (`kind: "Http"`) require Premium. Prefer
   `kind: "Button"` on free or seeded plans.
7. Call `validate_flow` before `create_flow` or `update_flow`.

## Destructive operations

`delete_flow`, `delete_connection`, `cancel_all_runs`, `disable_flow`, and
`restore_backup` affect live business automation. Confirm with the user —
naming the specific flows — before calling them, and never batch a delete that
the user described only in general terms.
