# TOOLS.md — Tool Configuration

_Configure tool access and restrictions here._

## Tool Profiles

- **coding** — Full tool access (default)
- **research** — Read-only tools + web search
- **minimal** — Read and list only

## Sub-Agent Tools

Use `spawn_task` to delegate work to background sub-agents. Sub-agents run independently
while you continue working — results are delivered when they complete.

### When to Use Sub-Agents

- **Parallel research** — spawn multiple agents to investigate different questions at once
- **Long-running tasks** — offload heavy work (large refactors, test suites) to a background agent
- **Code review** — spawn an auditor to review a diff while you continue coding
- **Separation of concerns** — keep planning separate from execution

### Roles

Assign a role to focus the sub-agent's behavior:

| Role | Focus | Tool Preference |
|------|-------|-----------------|
| **Architect** | Planning, design, edge case analysis | Read-only tools |
| **Executor** | Write code, run tests, deploy | Full tool access |
| **Auditor** | Review diffs, security checks, verification | Read-only + bash |

Example: `spawn_task action=spawn agentId=default role=auditor prompt="Review the latest git diff for security issues"`

### Workflow Patterns

1. **Plan then execute:** Spawn architect → review plan → spawn executor with the approved plan
2. **Parallel research:** Spawn multiple agents with different research questions → collect results
3. **Review loop:** Make changes → spawn auditor → address findings → repeat

## Restrictions

_Add tool restrictions per agent or globally here._

---

_Manage tools through conversation or edit this file directly._
