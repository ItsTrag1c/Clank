# Clank Gateway Architecture

> **Deployment Note:** Clank is designed to run on dedicated hardware (dev machine, VM, or container) due to its full system access model. See the [Threat Model](THREAT_MODEL.md) and [Security Policy](../SECURITY.md) for detailed security considerations.

## Overview

Clank Gateway is a single-daemon AI agent gateway that exposes both WebSocket and HTTP interfaces on port **18790**. All communication uses JSON-RPC 2.0. One process handles every connected channel, every active agent, and every tool invocation.

```
                         +------------------+
                         |   Clank Gateway  |
                         |   (port 18790)   |
                         +--------+---------+
                                  |
              +-------------------+-------------------+
              |                   |                   |
         WebSocket             HTTP              Channels
        (real-time)          (REST)         (Telegram, Discord,
                                             Web UI, CLI, TUI)
              |                   |                   |
              +-------------------+-------------------+
                                  |
                          +-------+-------+
                          | AgentEngine   |
                          | (ReAct loop)  |
                          +-------+-------+
                                  |
                    +-------------+-------------+
                    |             |             |
              ContextEngine   ToolRouter   ProviderRouter
              (compaction,    (23 tools)   (8 providers)
               budgeting)
                    |
              MemoryEngine
              (TF-IDF, decay)
```

The gateway is stateful per-session. Each session tracks its own conversation history, context window, and active agent configuration.

---

## Engine

### AgentEngine (ReAct Loop)

The core execution model is ReAct: **Reason, Act, Observe, Repeat.**

1. **Reason** -- The model receives the conversation history plus context and decides what to do next.
2. **Act** -- If the model emits a tool call, the gateway executes it.
3. **Observe** -- The tool result is appended to the conversation.
4. **Repeat** -- The loop continues until the model produces a final text response with no tool calls, or hits a configured iteration limit.

This loop powers every interaction, whether it arrives from the CLI, Telegram, or the Web UI. The agent keeps looping autonomously until it decides it has enough information to respond.

### ContextEngine (Two-Tier Compaction)

Context windows are finite. The ContextEngine manages what stays and what gets compressed.

**Tier 1 -- Mechanical compaction.** Old messages are truncated mechanically: tool results get trimmed, verbose outputs get cut to a summary line. This is fast and deterministic, no LLM call required.

**Tier 2 -- LLM-summarized compaction.** When tier-1 isn't enough, the engine asks the model to summarize older conversation segments into a compact block. This preserves semantic meaning while dramatically reducing token count.

### Token Budgeting

Every message sent to the provider is budgeted against the model's context limit. The engine tracks token usage across:

- System prompt
- Memory injections
- Conversation history
- Pending tool results

### Proactive Auto-Compaction

Compaction doesn't wait for failures. It triggers in three scenarios:

1. **Post-tool** -- After every tool result, the engine checks if context is getting heavy.
2. **Pre-send safety (90%)** -- Before sending any request to the provider, if context usage exceeds 90% of the model's limit, compaction runs automatically.
3. **Context error recovery** -- If a provider returns a context-length error despite budgeting, the engine compacts aggressively and retries.

---

## Providers

Eight provider adapters, all implementing the same interface:

| Provider | What it connects to | Notes |
|----------|-------------------|-------|
| **Ollama** | Local Ollama instance | Default for local models |
| **Anthropic** | Claude API | Streaming, tool use |
| **OpenAI** | OpenAI API | GPT-4o, o1, etc. |
| **OpenAI (compatible)** | LM Studio, vLLM, llama.cpp | Any OpenAI-compatible endpoint |
| **Google Gemini** | Gemini API | Native function calling |
| **OpenRouter** | OpenRouter | Multi-model routing |
| **OpenCode** | OpenCode servers | Community models |
| **Codex** | Codex (OAuth) | OAuth-authenticated access |

**PromptFallbackProvider** wraps any provider to handle models that don't support native tool calling. It injects tool definitions into the system prompt and parses structured output from the model's text response. This is how local models without function-calling support can still use all 23 tools.

---

## Tools

### Core Tools (10)

| Tool | Purpose |
|------|---------|
| `read_file` | Read file contents with line numbers |
| `write_file` | Write or overwrite a file |
| `edit_file` | Surgical string replacement in files |
| `list_directory` | List files and directories |
| `bash` | Execute shell commands |
| `search_files` | Regex search across files (ripgrep-style) |
| `glob_files` | Find files by glob pattern |
| `git` | Git operations (status, diff, commit, etc.) |
| `web_search` | Search the web via SearXNG or configured engine |
| `web_fetch` | Fetch and extract content from URLs |

### Self-Configuration Tools (9)

These let the agent modify its own configuration at runtime -- switching models, adjusting behavior, managing agents. The agent can reconfigure itself in response to user requests without requiring manual config edits.

### Voice Tools (3)

Speech-to-text, text-to-speech, and voice session management for voice interaction support.

### File Tool (1)

Extended file operations beyond the core read/write/edit (e.g., move, copy, permissions).

---

## Channels

### Telegram (grammY)

Full bot integration using the grammY framework. Supports text, voice messages, inline commands, and message threading. Each Telegram chat maps to a Clank session.

### Discord (discord.js)

Discord bot using discord.js. Supports slash commands, text channels, DMs, and thread-based conversations. Each Discord channel or thread maps to a session.

### Web UI (8-Panel SPA)

A local single-page application with eight panels: chat, file browser, terminal, agent config, memory viewer, session manager, model selector, and system status. Connects to the gateway over WebSocket.

### CLI

Direct terminal interaction. The `clank chat` command opens a REPL that talks to the gateway. Supports streaming responses, tool call display, and session management.

### TUI

Terminal UI mode (`clank tui`) providing a richer terminal experience with panels, scrolling history, and visual tool call feedback.

---

## Multi-Agent

Clank supports multiple named agents, each with independent configuration:

- **Config-driven routing** -- Each agent is defined in `config.json5` with its own model, system prompt, and tool access.
- **Per-agent model assignment** -- One agent can use Claude, another Ollama, another GPT-4o. Each agent routes to its configured provider.
- **Sub-agent spawning** -- Agents can spawn sub-agents for background tasks. Depth control prevents runaway recursion. Concurrent limits cap how many sub-agents can run simultaneously.
- **Parent-child tree** -- Sub-agents report back to their parent. The parent can kill, steer, or message child agents.

---

## Memory

The memory system uses **TF-IDF cosine similarity with decay scoring** to surface relevant memories.

- **Auto-persistence** -- Memories are saved automatically as conversations progress. The agent decides what's worth remembering.
- **Decay scoring** -- Older memories lose relevance weight over time, so recent context naturally ranks higher.
- **Smart injection for local models** -- Instead of injecting the full `MEMORY.md` file into context (which wastes tokens for smaller models), the engine runs relevance matching against the current conversation and injects only the memories that score above a threshold.

Memories persist as plain files on disk. No database, no external service.

---

## Sessions

- **Cross-channel normalized keys** -- A session key is normalized so that the same logical conversation can be tracked across channels. A Telegram chat and a CLI session can share context if configured to do so.
- **JSON persistence** -- Sessions are saved as JSON files on disk. They include conversation history, compacted context, active agent state, and metadata.

---

## Security

| Layer | Implementation |
|-------|---------------|
| **Bash blocklist** | 25 patterns matching dangerous commands (`rm -rf /`, `mkfs`, `dd if=`, `:(){`, etc.) |
| **Config redaction** | API keys and secrets are never exposed through the RPC API or tool outputs |
| **SSRF protection** | Blocks requests to private IPs (10.x, 172.16-31.x, 192.168.x), link-local, metadata endpoints (169.254.169.254), and IPv6 equivalents |
| **AES-256-GCM** | Stored credentials are encrypted at rest |
| **Rate limiting** | 20 requests per minute per session by default |
| **Filename sanitization** | Path traversal prevention on all file operations |
| **System file protection** | The agent won't modify files outside the workspace unless the user explicitly names them |

See [THREAT_MODEL.md](THREAT_MODEL.md) for a full security assessment including known limitations.

---

## Config

Configuration lives at:
- **Windows:** `%APPDATA%/Clank/config.json5`
- **Linux/macOS:** `~/.clank/config.json5`

**JSON5 format** -- Supports comments, trailing commas, unquoted keys, and multi-line strings.

**Environment variable substitution** -- Use `${ENV_VAR}` in config values. The gateway resolves them at startup.

**Hot-reload** -- The gateway watches the config file. Changes take effect without restarting the daemon. Agent definitions, model assignments, and channel configs can all be updated live.
