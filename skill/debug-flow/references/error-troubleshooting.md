# Common API Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `500 NullReferenceException` | Missing `$authentication` parameter | Add a `parameters` block declaring `$authentication` and `$connections` |
| `InvokerConnectionOverrideFailed` | Used `"source": "Invoker"` | Change to `"source": "Embedded"` in connection refs |
| `WorkflowRunActionInputsInvalidProperty` | Included `"authentication"` in action inputs | Remove it — PA auto-injects on save |
| `InvalidTemplate` / parameter not declared | Missing parameter declaration | Declare `$authentication` and `$connections` in the definition |
| `DirectApiRequestHasMoreThanOneAuthorization` | Added an auth header to a SAS URL | Don't add `Authorization` to SAS URLs |
| `ConnectionNotFound` / `AuthorizationFailed` | Expired or deleted connection | `test_connection`, then `fix_connection` or `pick_or_create_connection`; if consent is required, send the user to make.powerautomate.com → Connections |
| `ExpressionEvaluationFailed` | Bad expression or null reference | Check syntax with `get_expression_help`; wrap nullable values in `coalesce()` |
| `WorkflowOperationParametersRuntimeMissingValue` | Required parameter empty at runtime | Add a null guard: `@if(empty(...), 'default', ...)` |
| `ActionTimedOut` | Action exceeded its timeout | Add a retry policy, raise the timeout, or split the operation |
| `InvalidOpenApiConnectionOperationType` | Wrong action type | Call `get_operation_details` and use the `actionType` it returns (`OpenApiConnection` vs `OpenApiConnectionWebhook`) |
| `triggerBody()` returns null | Triggered via the management API rather than the callback URL | Pass `body` to `run_flow` so it uses the callback URL, or guard with `coalesce()` |

## Diagnostic Steps

1. **Triage the run** — `diagnose_run` returns failed and timed-out actions
   already classified, each with a remediation. Always start here.
2. **Recent failures** — `get_run_history` with `top: 5` to find the run.
3. **Action-level trace** — `get_run_actions` for the full execution trace.
4. **Loop iterations** — `get_run_action_repetitions` on an action *inside* the
   loop (the container itself returns none).
5. **Definition context** — `get_flow` to see what the action was configured to
   do.
6. **Before rewriting** — `validate_flow` (offline rules) and `preflight_flow`
   (missing refs, solution-wrap risk).

## Applying a Fix

Prefer `edit_flow` for a surgical change to one action or parameter. Fall back
to `update_flow` only when rewriting most of the definition. `get_backup` /
`list_backups` / `restore_backup` exist if a change needs reverting.
