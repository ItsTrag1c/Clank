# Clank

> Local-first AI agent gateway. Open-source alternative to OpenClaw, optimized for local models.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## What is Clank?

Clank is a personal AI gateway — a single daemon that connects your preferred interfaces (CLI, browser, Telegram, Discord) to AI agents running local or cloud models. One gateway, many frontends, all equal.

**Built for people who want the OpenClaw experience without the token costs.**

## Features

- **Local-first** — Auto-detects Ollama, LM Studio, llama.cpp, vLLM. Cloud providers optional.
- **Multi-agent** — Named agents with separate models, workspaces, and tools
- **Multi-channel** — CLI, Web UI, Telegram, Discord, Slack — all equal interfaces
- **Self-configuring** — After initial setup, configure everything through conversation
- **Pipeline orchestration** — Chain agents together for complex workflows
- **Plugin system** — Extend with custom tools, channels, and providers
- **Cron scheduler** — Scheduled and recurring agent tasks
- **Voice support** — Cloud (ElevenLabs) or fully local (whisper.cpp + piper)
- **File-based storage** — JSON/JSONL/Markdown. Inspectable, editable, no database.

## Quick Start

```bash
npm install -g clank
clank setup
```

Setup auto-detects local models, configures the gateway, and gets you chatting in under 2 minutes.

## Architecture

```
              ┌─────────────────────────────┐
              │       Clank Gateway          │
              │     (single daemon)          │
              │                              │
              │  Agent Pool + Routing        │
              │  Sessions, Memory, Pipelines │
              │  Cron, Tools, Plugins        │
              └──────────────┬───────────────┘
                             │
                WebSocket + HTTP (port 18789)
                             │
      ┌──────────┬───────────┼───────────┬──────────┐
      │          │           │           │          │
  clank CLI  Web UI     Telegram    Discord    Desktop
  (terminal) (browser)   (bot)      (bot)    (Tauri WS)
```

One gateway, many frontends. All share sessions, memory, and pipeline state.

## Commands

```bash
# Chat
clank chat                    # CLI chat (connects to gateway)
clank chat --web              # Open in browser
clank chat --new              # Fresh session

# Gateway
clank gateway start           # Start daemon
clank gateway stop            # Stop daemon
clank gateway status          # Show status

# Management
clank setup                   # Onboarding wizard
clank fix                     # Diagnostics & repair
clank models                  # List available models
clank agents                  # List configured agents

# System Service
clank daemon install          # Install as system service
clank daemon status           # Service status
```

## Requirements

- Node.js 20+
- A local model server (Ollama recommended) or cloud API key

## Links

- **Website:** [clanksuite.dev](https://clanksuite.dev)
- **Legacy:** [Clank-Legacy](https://github.com/ItsTrag1c/Clank-Legacy) (archived CLI v2.7.0 + Desktop v2.6.1)

## License

MIT
