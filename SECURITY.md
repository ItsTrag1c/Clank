# Security Policy

## Supported Versions

| Version | Status |
|---------|--------|
| 0.x (Gateway) | In development |

Legacy versions (CLI v2.7.0, Desktop v2.6.1) are archived at [Clank-Legacy](https://github.com/ItsTrag1c/Clank-Legacy) and no longer receive updates.

## Reporting a Vulnerability

If you discover a security vulnerability in Clank, please report it responsibly:

1. **Do not** open a public GitHub issue
2. Contact the maintainer directly
3. Include: description, reproduction steps, potential impact

We will acknowledge receipt within 48 hours and provide a fix timeline within 7 days.

## Security Model

### Gateway
- Binds to `127.0.0.1` by default — not accessible from the network
- Token-based authentication for all WebSocket client connections
- LAN/remote access must be explicitly configured

### Encryption
- API keys encrypted at rest with AES-256-GCM (PBKDF2, 100K iterations, SHA-256)
- PIN verification uses PBKDF2 hash with random salt, timing-safe comparison
- Optional encryption for conversation transcripts

### Tool Execution
- 3-tier safety system (low/medium/high risk classification)
- Configurable auto-approve per safety level
- Destructive command blocking (`rm -rf /`, `format`, etc.)
- Operations outside workspace require explicit approval

### Channels
- Per-channel user allowlists
- Group chat mention requirements
- Optional DM pairing/approval flow

### Plugins
- In-process execution (trust boundary = user's machine)
- Local-only loading (no remote plugin fetching)
- Plugins respect agent-level tool policy restrictions
