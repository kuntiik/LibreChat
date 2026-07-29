---
name: route-environments
description: Manage environment resolution — check which environment you create flows in by default, list available environments, and set your working environment. Use when the user asks about environments, their default environment, where to create flows, or switching environments.
user-invocable: true
argument-hint: "[list|check|set]"
allowed-tools:
  - list_environments_mcp_power-automate
  - set_current_env_mcp_power-automate
  - get_current_env_mcp_power-automate
  - resolve_environment_mcp_power-automate
---

# Environment Resolution

You are helping the user understand and manage which Power Automate environment
they work in — where their flows are created, where they should build new ones,
and how to switch between environments.

Uses `resolve_environment`, `list_environments`, `set_current_env`, and
`get_current_env` (call them with the `_mcp_power-automate` suffix).

## Step 1: Understand what the user needs

- **"Which environment am I in?"** → `get_current_env` or `resolve_environment`
- **"Where should I create flows?"** → help them pick the right environment
- **"What environments do I have?"** → `list_environments`
- **"Switch my environment"** → `set_current_env`

## Step 2: List and explain environments

Call `list_environments` and present a clear summary:

| Environment | Type | Location | Notes |
|-------------|------|----------|-------|
| ... | Default / Developer / Sandbox / Production | ... | ... |

Help the user identify:

- **Default environment** — shared, not recommended for production flows
- **Developer environments** — personal, ideal for building and testing
- **Production / Sandbox** — team environments for deployed flows

## Step 3: Set the working environment

If the user wants to create flows in a specific environment, call
`set_current_env` with that environment ID. This pins subsequent FlowAgent
operations to that environment for the session.

**Recommendation for new users**: if they have a Developer environment, suggest
that. If not, suggest they ask their admin to provision one, or use the default
environment for simple personal automations.

## Guidance

- `resolve_environment` shows how the environment resolves (routing → poll →
  fallback)
- `set_current_env` changes the session default — it does **not** change
  tenant-level routing
- Tenant-level environment routing (which environment new makers land in) is
  configured by admins at `admin.powerplatform.microsoft.com`. Direct users
  there for org-wide routing questions.
- For maker-facing questions: "when you open make.powerautomate.com, your
  default environment determines where new flows are created"

## Decision Tree

```
User asks about environments?
├── "Which environment am I in?" → get_current_env / resolve_environment
├── "What environments exist?"   → list_environments with summary table
├── "Where should I build?"      → recommend Developer env; set_current_env
├── "Switch to X environment"    → set_current_env
├── "How do I create a new env?" → direct to the PPAC admin center
└── "What is environment routing?" → explain: determines default for new makers
```
