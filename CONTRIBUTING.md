# Contributing to Clank

Welcome! Clank is an open-source, local-first AI gateway. Contributions are welcome from everyone — whether you're fixing a typo, adding a provider, or training the next version of Wrench.

## Ways to Contribute

- **Code** — Gateway features, bug fixes, new providers, new tools
- **Training Data** — New JSONL examples for the Wrench model
- **Benchmark Prompts** — Test cases that push tool-calling accuracy
- **Bug Reports** — File GitHub issues with steps to reproduce
- **Documentation** — Improvements to README, guides, or inline comments

## Getting Started

```bash
git clone https://github.com/ClankLabs/Clank.git
cd Clank
npm install
npm run build        # tsup builds to dist/
clank setup          # first-time config wizard
```

After setup, run `clank gateway` to start the daemon locally.

## Code Style

- TypeScript, with semicolons
- Keep it simple. No over-engineering — if a function does one thing well, that's enough
- Use descriptive names. Avoid abbreviations unless they're universal (e.g., `config`, `msg`)
- Follow existing patterns in the codebase. When in doubt, look at a neighboring file

## Training Data Format

Wrench training data lives in JSONL files. Each line is a self-contained JSON object with a `conversations` array. Roles are `system`, `user`, `assistant`, and `tool`.

Tool calls from the assistant use the ` ```tool_call ` fenced block format. Tool results come back as the `tool` role.

**Example:**

```json
{
  "conversations": [
    { "role": "system", "content": "You are a helpful assistant with access to tools." },
    { "role": "user", "content": "What files are in the current directory?" },
    { "role": "assistant", "content": "I'll list the files for you.\n\n```tool_call\n{\"name\": \"list_directory\", \"arguments\": {\"path\": \".\"}}\n```" },
    { "role": "tool", "content": "README.md\npackage.json\nsrc/\ntsconfig.json" },
    { "role": "assistant", "content": "The current directory contains README.md, package.json, a src/ folder, and tsconfig.json." }
  ]
}
```

Each example should demonstrate a realistic, complete interaction. Include the system prompt, at least one user turn, and the full tool-call round trip if tools are involved.

## Pull Requests

1. Fork the repo and create a feature branch (`git checkout -b my-feature`)
2. Make your changes and test locally (`npm run build`)
3. Open a PR against `main`
4. Keep PRs focused — one feature or fix per PR
5. Describe **what** changed and **why** in the PR description

## Issues

Use [GitHub Issues](https://github.com/ClankLabs/Clank/issues) for bugs and feature requests.

For bugs, include:
- What you expected to happen
- What actually happened
- Steps to reproduce
- Clank version (`clank --version`), OS, and provider/model if relevant

## Community

Follow [@Clank_Labs](https://x.com/Clank_Labs) on X for updates. Be respectful — we're all here to build something useful.
