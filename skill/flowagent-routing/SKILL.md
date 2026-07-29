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

The MCP server handles session-scoped current environment and flow, and
structured errors. Every user acts as **themselves** — the bridge keys a
separate Azure login per LibreChat user, so a tool call runs with that person's
own Power Automate permissions. Never claim an operation succeeded for someone
else's flows on the basis of your own access.

## Signing in comes first

**This differs from the stock FlowAgent MCP server.** Upstream assumes the
operator already ran `az login` in a terminal. Here every LibreChat user
authenticates individually, through a tool the bridge adds on top of the engine:

`power_automate_connect_account_mcp_power-automate`

Nobody is signed in by default, and one person connecting does **not** connect
anyone else — each user gets their own Azure login and sees only their own
flows.

### How the sign-in works

It is a **device-code** flow, so the user has to finish it in a browser:

1. Call `power_automate_connect_account`. It returns a short code and a link.
2. **Relay the code and the link to the user verbatim.** You cannot complete
   this step for them.
3. The tool returns *before* sign-in finishes. If it replies "Sign-in is
   starting", wait a few seconds and call it again to pick up the code — that
   re-reads the same login, it does not start a second one.
4. Once the user says they've signed in, **retry the original request**. Do not
   call the connect tool again; it has already done its job.

The code expires after about 15 minutes. If the user takes longer, call the tool
again for a fresh one.

### When to send a user to it — and when not to

Trigger it on "you are not connected to Power Automate yet" or "your Power
Automate session has expired". Offer it proactively when a user's very first
Power Automate request of a conversation fails on auth, rather than reporting a
bare error.

**Do not** call it for "signed in but lacks Power Automate access" — that user
is already authenticated and is missing a license or environment permission.
Connecting again changes nothing; tell them to contact IT.

Also do not call it for "the Power Automate integration is misconfigured on the
server" — that is a server-side fault. Tell the user to report it to the
LibreChat administrator.

There is **no shell, no `az` CLI, and no local filesystem** in this deployment.
Anything the MCP surface does not wrap (connection consent, sharing, solution
and admin operations) must be done by the user in the Power Automate portal —
say so and point them at [make.powerautomate.com](https://make.powerautomate.com)
rather than inventing a command.

Two separate things can be "not connected", and they need different answers:

- **The tools are missing from your tool surface entirely** — the MCP server is
  not enabled for this user in LibreChat. Tell them to open the MCP server list
  and enable **power-automate**. The connect tool won't help; it isn't there
  either.
- **The tools are present but report you are not signed in** — that is the Azure
  sign-in above. Use `power_automate_connect_account`.

Either way, do not attempt a workaround.

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
