# Clank Privacy Policy

**Revision:** 1.0
**Effective Date:** 2026-03-22
**Last Updated:** 2026-03-22

---

## Overview

Clank is a local-first AI agent gateway. Your data stays on your machine.

## Data Collection

**Clank collects no data.** The application runs entirely on your local machine. No telemetry, no analytics, no usage tracking.

## Data Storage

All data is stored locally on your machine:

| Data | Location | Encryption |
|------|----------|------------|
| Configuration | `~/.clank/config.json5` | API keys encrypted (AES-256-GCM) |
| Sessions | `~/.clank/conversations/` | Optional encryption |
| Memory | `~/.clank/memory/` | Plaintext (local only) |
| Workspace | `~/.clank/workspace/` | Plaintext (local only) |
| Cron jobs | `~/.clank/cron/` | Plaintext (local only) |
| Logs | `~/.clank/logs/` | Plaintext (local only) |

## External Connections

Clank connects to external services **only when you configure them**:

- **LLM Providers** (Ollama, Anthropic, OpenAI, Google) — Your prompts and responses are sent to the provider you choose. Local models (Ollama) never leave your machine.
- **Channel Platforms** (Telegram, Discord, Slack) — Messages are sent through the platform's API when you configure a bot.
- **Web Search** (Brave, Google) — Search queries are sent to the provider you choose.
- **Voice** (ElevenLabs) — Audio is sent to the provider for TTS/STT. Local voice (whisper.cpp + piper) never leaves your machine.

## API Keys

API keys are encrypted at rest using AES-256-GCM with PBKDF2-derived keys (100,000 iterations, SHA-256). Keys are only decrypted in memory when needed for API calls.

## Gateway Security

- The gateway binds to localhost by default (not accessible from the network)
- Token-based authentication for all client connections
- No remote access unless explicitly configured

## Your Rights

Your data is yours. Delete `~/.clank/` to remove everything. There is no cloud account, no remote backup, nothing to request deletion of.

## Changes

| Rev | Date | Change |
|-----|------|--------|
| 1.0 | 2026-03-22 | Initial privacy policy for Clank Gateway |
