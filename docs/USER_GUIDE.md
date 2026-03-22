# Clank — User Guide

How to use Clank day-to-day. For installation, see [INSTALL.md](INSTALL.md).

---

## The Basics

Clank is a gateway — one daemon runs in the background, and you connect to it from any interface. Start it with:

```bash
clank
```

This starts the gateway (Telegram/Discord stay alive) and opens the TUI. You can also use:

| Interface | Command | When to use |
|-----------|---------|-------------|
| **TUI** | `clank` or `clank tui` | Daily driver — rich terminal with streaming |
| **CLI** | `clank chat` | Quick direct chat, no gateway needed |
| **Web UI** | `clank chat --web` | Browser-based dashboard with all panels |
| **Telegram** | Message your bot | On the go, from your phone |
| **Discord** | Message in server | Team/community access |

All interfaces share sessions. Start a conversation in TUI, continue it from Telegram, check the results in the Web UI.

---

## Talking to Your Agent

Just type naturally. Clank understands context:

```
you > Read the README and summarize the project structure

you > Fix the failing test in auth.test.ts

you > Search for all TODO comments in the codebase

you > Install express and create a basic server
```

The agent reads files, writes code, runs commands, and uses tools automatically. You'll see tool execution in real-time.

### Tool Confirmations

Risky operations (writing files, running commands) ask for confirmation:

```
  Confirm: Run: npm install express [y/n/always]
```

- `y` — approve this one
- `n` — deny
- `always` — auto-approve this tool for the rest of the session

Configure auto-approve levels in config:

```json5
{
  tools: {
    autoApprove: {
      low: true,     // read operations — auto-approved
      medium: false,  // write operations — ask
      high: false     // bash, system ops — always ask
    }
  }
}
```

---

## TUI Commands

### Slash Commands

| Command | Action |
|---------|--------|
| `/help` | Show commands |
| `/status` | Agent, model, session info |
| `/agent [name]` | Switch or list agents |
| `/session [key]` | Switch or list sessions |
| `/model` | Show current model |
| `/think` | Toggle thinking block visibility |
| `/tools` | Toggle tool output display |
| `/new` | Start a new session |
| `/reset` | Clear current session |
| `/exit` | Quit |

### Shell Commands

Prefix with `!` to run a command on your machine:

```
you > !git status
you > !npm test
you > !docker ps
```

---

## Web UI

Open with `clank chat --web` or `clank dashboard`.

### Panels

| Panel | What it does |
|-------|-------------|
| **Chat** | Send messages, see streaming responses, tool cards, thinking blocks |
| **Agents** | View configured agents, their models, and status |
| **Sessions** | Browse all sessions, switch between them, delete old ones |
| **Config** | Edit config.json5 directly in the browser, save to apply |
| **Pipelines** | View pipeline definitions and execution history |
| **Cron** | View and manage scheduled jobs |
| **Logs** | Live log output with level coloring |
| **Channels** | Channel adapter status (Telegram, Discord, etc.) |

---

## Multi-Agent

Create named agents with different models and roles:

```json5
{
  agents: {
    defaults: {
      model: { primary: "ollama/qwen3.5" }
    },
    list: [
      {
        id: "coder",
        name: "Coder",
        model: { primary: "ollama/qwen3.5" },
        workspace: "~/Projects"
      },
      {
        id: "writer",
        name: "Writer",
        model: { primary: "anthropic/claude-sonnet-4-6" },
        toolTier: "core"
      }
    ]
  }
}
```

Or just tell your agent: *"Create a new agent called Coder that uses Qwen 3.5 for my Projects folder"*

Switch agents:
- **TUI:** `/agent coder`
- **Telegram:** `/agent coder`
- **Web UI:** Agents panel

### Routing

Route messages to specific agents based on channel:

```json5
{
  // Telegram group → Writer agent
  channels: {
    telegram: {
      groups: {
        "-123456": { requireMention: true }
      }
    }
  }
}
```

---

## Scheduled Tasks (Cron)

Create recurring tasks:

```bash
clank cron add --name "Daily summary" --schedule "24h" --prompt "Summarize what changed in the codebase today"
```

Or tell your agent: *"Check my email every hour and notify me on Telegram if anything urgent"*

Manage jobs:

```bash
clank cron list
clank cron remove <id>
```

---

## Pipelines

Chain agents together for complex workflows:

```yaml
# In config
pipelines:
  code-review:
    steps:
      - agent: coder
        action: "Read the PR diff and identify issues"
      - agent: writer
        action: "Write review comments in a professional tone"
```

Each step's output becomes the next step's input context.

---

## Memory

Clank remembers across sessions:

- **Workspace files** — SOUL.md (personality), USER.md (about you), MEMORY.md (persistent notes)
- **Agent memory** — TF-IDF matched, decays over time, categorized (identity, knowledge, lessons, context)
- **Project memory** — `.clank.md` in any project root for per-project context

### Workspace Files

| File | Purpose |
|------|---------|
| `SOUL.md` | Agent personality and behavior rules |
| `USER.md` | Information about you (name, timezone, preferences) |
| `IDENTITY.md` | The agent's name, vibe, emoji |
| `MEMORY.md` | Persistent notes and learnings |
| `AGENTS.md` | Agent definitions |
| `TOOLS.md` | Tool access configuration |
| `BOOTSTRAP.md` | First-conversation script (delete after setup) |
| `HEARTBEAT.md` | Periodic check definitions |

Edit these files to customize your agent's behavior. The agent can also edit them through conversation.

---

## Plugins

Extend Clank with local plugins:

```bash
# Install a plugin
npm install clank-plugin-docker

# Or put it in the plugins directory
~/.clank/plugins/my-plugin/
```

Plugin manifest (`clank-plugin.json`):

```json
{
  "name": "clank-plugin-docker",
  "version": "1.0.0",
  "type": "tool",
  "tools": [{
    "name": "docker_exec",
    "description": "Run a command in a Docker container",
    "safetyLevel": "high",
    "entrypoint": "./tools/docker-exec.js"
  }]
}
```

No marketplace — plugins are local directories or npm packages.

---

## Configuration Reference

Config file: `~/.clank/config.json5` (or `%APPDATA%\Clank\config.json5` on Windows)

```json5
{
  // Gateway
  gateway: {
    port: 18790,
    bind: "loopback",       // "loopback" or "lan"
    auth: { mode: "token" } // token auto-generated
  },

  // Agents
  agents: {
    defaults: {
      model: {
        primary: "ollama/qwen3.5",
        fallbacks: ["anthropic/claude-sonnet-4-6"]
      },
      workspace: "~/.clank/workspace",
      toolTier: "auto",      // "full", "core", or "auto"
      temperature: 0.7
    },
    list: []
  },

  // Providers
  models: {
    providers: {
      ollama: { baseUrl: "http://127.0.0.1:11434" },
      anthropic: { apiKey: "..." },
      openai: { apiKey: "..." },
      google: { apiKey: "..." }
    }
  },

  // Channels
  channels: {
    web: { enabled: true },
    telegram: { enabled: true, botToken: "...", allowFrom: ["@you"] },
    discord: { enabled: false, botToken: "..." }
  },

  // Sessions
  session: { dmScope: "main", maxSessions: 50 },

  // Tools
  tools: {
    autoApprove: { low: true, medium: false, high: false },
    webSearch: { enabled: true, provider: "brave", apiKey: "..." }
  },

  // Safety
  safety: { confirmExternal: true }
}
```

Supports `${ENV_VAR}` substitution for secrets.

---

## Tips

- **First conversation** — if BOOTSTRAP.md exists, the agent starts by introducing itself and learning about you. After that, it deletes the file.
- **Project context** — put a `.clank.md` in any project root. The agent reads it automatically.
- **Tool tiering** — set `toolTier: "core"` for smaller models (reduces confusion), `"auto"` for smart middle ground, `"full"` for capable models.
- **Multiple terminals** — open as many TUI/CLI sessions as you want. They all connect to the same gateway.
- **Self-config** — instead of editing config, just tell your agent: *"Add Brave search"*, *"Connect my Telegram bot"*, *"Create a cron job"*.

---

## Links

- **Website:** [clanksuite.dev](https://clanksuite.dev)
- **GitHub:** [ItsTrag1c/Clank](https://github.com/ItsTrag1c/Clank)
- **Twitter/X:** [@ClankSuite](https://x.com/ClankSuite)
- **Reddit:** [u/ClankSuite](https://reddit.com/u/ClankSuite)
