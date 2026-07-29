# Deployment Skills

Place shared deployment skills in this directory. Each skill should live in its own folder with a
`SKILL.md` file, for example:

```text
skill/
  my-shared-skill/
    SKILL.md
    references/
      notes.md
```

These skills are loaded at server startup, exposed read-only to all users with Skills enabled, and
are not persisted as Skill documents in MongoDB. The directory is `DEPLOYMENT_SKILLS_DIR` (defaults
to `./skill`).

## Power Automate (FlowAgent) skills

Ported from Microsoft's [`power-platform-skills`](https://github.com/microsoft/power-platform-skills)
marketplace plugin (`plugins/power-automate`), which is what makes the FlowAgent MCP server usable
in Claude Code. Without them LibreChat sees only the raw tool schemas and no procedure.

| Skill | Purpose |
|-------|---------|
| `flowagent-routing` | Always-apply baseline: tool routing, definition hard rules, destructive-op confirmation. Not user-invocable, kept out of the model catalog. |
| `browse-flows` | Read-only exploration of environments and flows |
| `route-environments` | Which environment am I in / switch it |
| `build-flow` | Autonomous build of a full flow from a description |
| `create-flow` | Guided wizard, confirms the design before creating |
| `debug-flow` | Interactive failed-run debugging and re-test |
| `diagnose-flow` | Deep post-mortem with a written report |
| `manage-flows` | Publish/test, batch ops, inventory, health, runaway-run response |
| `manage-desktop-flows` | Power Automate Desktop (RPA) flows and machine groups |

`references/*.md` are loaded on demand by the model via `read_file`, so their content costs no
context until a skill actually needs it. `definition-reference.md`, `connection-patterns.md`, and
`error-troubleshooting.md` are duplicated into each skill that uses them because `read_file` is
scoped to the primed skill — edit all copies together.

### Differences from upstream

- Tool names are rewritten to LibreChat's MCP form: `<tool>_mcp_power-automate` (upstream uses
  `mcp__flowagent__<tool>`). If the `power-automate` server in `librechat.yaml` is ever renamed,
  every `allowed-tools` list here must be updated to match.
- `allowed-tools` is trimmed per skill to the tools that skill actually uses, rather than upstream's
  copy-pasted 51-tool list. In LibreChat `allowedTools` is *additive* — it unions tools onto the
  agent for the turn — so the list is worth keeping accurate.
- Claude Code built-ins (`Bash`, `Read`, `Write`, `Glob`, `Grep`, `AskUserQuestion`) are dropped;
  they don't exist here. Steps that relied on the filesystem or on `AskUserQuestion` were rewritten
  to build JSON inline and to ask the user in plain text.
- `model: opus` and `context: fork` are dropped — LibreChat accepts both keys but neither is applied.
- The upstream `setup` and `report-issue` skills are omitted: `setup` wires a local `.mcp.json` via
  the Azure CLI, and neither applies to a hosted bridge.
- CLI instructions in the reference docs are rewritten to the MCP equivalents, and
  `cli-reference.md` is dropped entirely. Operations the MCP surface doesn't wrap (OAuth consent,
  connection sharing, solution/admin work) now say so and point at make.powerautomate.com.
