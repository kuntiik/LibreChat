# Flow Definition Reference

## Required Structure

```json
{
  "$schema": "https://schema.management.azure.com/providers/Microsoft.Logic/schemas/2016-06-01/workflowdefinition.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "$authentication": { "defaultValue": {}, "type": "SecureObject" },
    "$connections": { "defaultValue": {}, "type": "Object" }
  },
  "triggers": { ... },
  "actions": { ... }
}
```

## Common Triggers

**Manual (Button)**
```json
{ "type": "Request", "kind": "Button", "inputs": { "schema": { "type": "object" } } }
```

**Recurrence (Scheduled)**
```json
{ "type": "Recurrence", "recurrence": { "frequency": "Day", "interval": 1 } }
```

**HTTP Request** — requires Premium; prefer `Button` on free/seeded plans.
```json
{ "type": "Request", "kind": "Http", "inputs": { "schema": { "type": "object", "properties": { ... } } } }
```

## Action Template (OpenApiConnection)

```json
{
  "type": "OpenApiConnection",
  "inputs": {
    "parameters": { "param1": "value1" },
    "host": {
      "apiId": "/providers/Microsoft.PowerApps/apis/shared_teams",
      "operationId": "PostMessageToConversation",
      "connectionName": "shared_teams"
    }
  },
  "runAfter": {}
}
```

## Other Action Types

- `Compose`: `{ "type": "Compose", "inputs": "<expression>" }`
- `Http`: `{ "type": "Http", "inputs": { "method": "GET", "uri": "..." } }`
- `If`: `{ "type": "If", "expression": { ... }, "actions": { ... }, "else": { "actions": { ... } } }`
- `Foreach`: `{ "type": "Foreach", "foreach": "@...", "actions": { ... } }`
- `Response`: `{ "type": "Response", "inputs": { "statusCode": 200, "body": "@..." } }`

## Expression Syntax

- String interpolation: `@{triggerBody()?['name']}`
- Functions: `concat()`, `formatDateTime()`, `utcNow()`, `body('<action>')`, `outputs('<action>')`
- Null handling: `coalesce()`, `if()`, `equals()`
- Connection ref: `@parameters('$connections')['shared_teams']['connectionId']`
- `result()` only works inside Scope/ForEach/Until/Switch actions
- `triggerBody()` may be null when the flow is triggered via the management API — wrap in `coalesce()`

Call the `get_expression_help` tool (optionally with `query` or `category`) for
the validated function reference rather than guessing.

## Validation Rules (checked by the `validate_flow` tool)

1. Declare both `$authentication` and `$connections` in `parameters`
2. Use `"type": "OpenApiConnection"` (NOT `ApiConnection`)
3. Do NOT add `"authentication"` to action inputs (auto-injected by PA on save)
4. `host.connectionName` must match a key in connection references
5. `runAfter` must reference existing action names
6. No `@odata.bind` parameter suffixes

## Dynamic Parameters

Parameters may carry annotations from the connector swagger:

- `dynamicValues` — valid values come from calling another operation (dropdown)
- `dynamicTree` — tree browser with `open`/`browse` operations (file picker)
- `dynamicSchema` — schema determined dynamically (varies by selection)

Resolve them with the `get_connector` tool, then `invoke_operation` or
`resolve_params`.
