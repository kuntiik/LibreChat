# Connection Resolution Patterns

All operations below go through FlowAgent MCP tools. There is no shell in this
deployment — the CLI equivalents from the upstream FlowAgent docs are not
available here, and anything the MCP surface does not wrap must be done by the
user in the Power Automate portal.

## Discovering Connections

- `list_connections` — list connections, filter with the `connector` parameter
  (e.g. `shared_teams`). Confirm at least one shows **Connected** status.
- `list_connectors` / `get_connector` — browse the connector catalogue and its
  operation index.
- `test_connection` — verify a specific connection still authenticates.

## Auto-Resolving Connection References

- `resolve_refs` — auto-discover connections for one or more connectors and
  build the connection-reference block for a definition.
- `pick_or_create_connection` — resolve a connector to a usable connection,
  creating one if none exists.
- `fix_connection` — repair a broken or expired connection.
- `delete_connection` — remove a connection.

`resolve_refs` falls back Dataverse → PowerApps API, and reports
`NO_CONNECTION_FOUND` when neither yields a connection.

## Connection Reference Format

```json
{
  "shared_teams": {
    "connectionName": "shared-teams-xxxxxxxx",
    "source": "Embedded",
    "id": "/providers/Microsoft.PowerApps/apis/shared_teams",
    "tier": "NotSpecified"
  }
}
```

## Connection Modes

- **Embedded** — the flow uses its own stored credentials. Default, and the only
  correct choice for flows triggered via API.
- **Invoker** — the flow uses the caller's credentials, and requires an
  `X-MS-APIM-Tokens` header. Using it here produces
  `InvokerConnectionOverrideFailed`.

### Dataverse Special Case

When `shared_commondataserviceforapps` runs Embedded it needs:

```json
"connectionProperties": { "authentication": { "type": "ManagedServiceIdentity" } }
```

## Creating Connections

Creating a brand-new connection requires an interactive OAuth consent, which
cannot be completed from chat. Use `pick_or_create_connection` first — if it
reports that consent is needed, hand the user the consent URL it returns, or
direct them to create the connection at
[make.powerautomate.com](https://make.powerautomate.com) → **Connections** →
**New connection**, then re-run.

Sharing a connection with another user is likewise portal-only.

## Critical Rules

1. **Always use `"source": "Embedded"`** in connection references. Never
   `Invoker`.
2. **`list_connections` requires Dataverse.** If the environment has none, the
   PowerApps API fallback inside `resolve_refs` is the way through.
3. **Verify before building.** A definition referencing a disconnected
   connection validates fine offline and fails at runtime with
   `AuthorizationFailed`.
