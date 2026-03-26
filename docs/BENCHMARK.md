# Clank Agent Benchmark

A standardized benchmark for evaluating tool-calling accuracy in local LLMs routed through [Clank Gateway](https://github.com/ItsTrag1c/Clank).

**License:** Apache 2.0

---

## Overview

This benchmark measures how reliably a language model uses tools when instructed to do so. It targets the specific failure mode that matters most for agent workloads: the model ignoring available tools, calling the wrong tool, or producing malformed arguments.

The benchmark consists of **25 prompts** across **5 categories**, each scored on a 0-3 scale for a maximum score of **75**. Every prompt is deterministic and reproducible — no subjective judgment is required beyond the scoring rubric defined below.

---

## Methodology

### System Prompt

All 25 prompts are run against the model using the following system prompt, with no modifications:

```
You are an AI agent with tools: read_file, write_file, edit_file, list_directory, bash, search_files, glob_files, git, web_search, web_fetch. ALWAYS use your tools to accomplish tasks. NEVER say you cannot access files or run commands.
```

### Test Environment

- Each prompt is sent as a single user turn with the system prompt above.
- The model's response is evaluated for tool calls, argument correctness, and response quality.
- Tests are run sequentially. No context carries between prompts (each is an isolated conversation).
- Tool calls do not need to execute successfully — the benchmark evaluates whether the model **attempted the correct call with valid arguments**.

### Reproducibility

Anyone with access to the model and a tool-calling runtime can reproduce this benchmark. The system prompt, all 25 prompts, and the scoring rubric are published in full below.

---

## Scoring Criteria

Each prompt is scored on a 4-point scale:

| Score | Meaning |
|-------|---------|
| **0** | Refused, gave a wrong answer, or failed to make a tool call when one was clearly needed. |
| **1** | Attempted a tool call but used the wrong tool or passed bad/malformed arguments. |
| **2** | Correct tool call with correct arguments, but poor response quality (e.g., no explanation, missing context, unhelpful framing). |
| **3** | Perfect — right tool, right arguments, good response quality. |

**Scoring is per-prompt, not per-tool-call.** If a prompt requires multiple tool calls, the score reflects the overall attempt. A prompt that gets 2 out of 3 tool calls right but botches the third scores a 2, not a 3.

---

## Test Prompts

### Category 1: Basic Tool Use (5 prompts)

These test whether the model reaches for a tool at all when the task clearly requires one.

| # | Prompt |
|---|--------|
| 1 | "Read the file at `/home/user/config.json` and tell me what port the server runs on." |
| 2 | "Create a new file at `/home/user/notes.txt` with the content: Hello World." |
| 3 | "List all files in the `/home/user/projects/` directory." |
| 4 | "Search for any file containing the string `API_KEY` in `/home/user/app/`." |
| 5 | "Run `git status` in the `/home/user/myrepo/` directory." |

### Category 2: Multi-Step Tasks (5 prompts)

These require chaining multiple tool calls or reasoning about ordering.

| # | Prompt |
|---|--------|
| 6 | "Read `/home/user/app/config.yaml`, find the database host, then search the codebase in `/home/user/app/src/` for any file that references that host." |
| 7 | "List the files in `/home/user/project/`, read the `README.md` if it exists, and summarize what the project does." |
| 8 | "Find all `.log` files in `/home/user/logs/`, read the most recent one, and tell me if there are any errors." |
| 9 | "Create a new branch called `fix/typo` in `/home/user/repo/`, edit `README.md` to fix the word 'teh' to 'the', then commit with message 'Fix typo in README'." |
| 10 | "Read `/home/user/data/input.csv`, count the number of lines, then write the count to `/home/user/data/linecount.txt`." |

### Category 3: Error Recovery (5 prompts)

These test how the model handles ambiguity, missing files, or incorrect paths.

| # | Prompt |
|---|--------|
| 11 | "Read the file at `/home/user/does-not-exist.txt`." |
| 12 | "Edit `/home/user/app/server.js` and change the port from 3000 to 8080. The file might not have a port defined — handle that case." |
| 13 | "Run `npm test` in `/home/user/app/`. If it fails, read the test output and suggest a fix." |
| 14 | "Search for `TODO` comments in `/home/user/project/`. If none are found, say so clearly." |
| 15 | "Read `/home/user/config.json`. If it's invalid JSON, explain what's wrong." |

### Category 4: Response Quality (5 prompts)

These test whether the model provides useful context alongside tool results, not just raw output.

| # | Prompt |
|---|--------|
| 16 | "Read `/home/user/app/package.json` and tell me which dependencies are outdated or have known issues." |
| 17 | "Run `df -h` and explain the disk usage in plain English." |
| 18 | "Read `/home/user/.bashrc` and suggest improvements for the user's shell configuration." |
| 19 | "Search `/home/user/app/src/` for any hardcoded passwords or secrets." |
| 20 | "Read the git log of `/home/user/repo/` (last 10 commits) and summarize the recent development activity." |

### Category 5: System Prompt Following (5 prompts)

These test whether the model respects the system prompt instruction to always use tools, even when the task seems trivial or the model might prefer to answer from memory.

| # | Prompt |
|---|--------|
| 21 | "What's in the `/etc/hostname` file?" |
| 22 | "Does the file `/home/user/app/index.js` exist?" |
| 23 | "What operating system is this machine running? Check the system, don't guess." |
| 24 | "What's the current git branch in `/home/user/repo/`?" |
| 25 | "How much free memory does this system have right now?" |

---

## Results

### Wrench Model Progression

| Model | Score | Percentage | Notes |
|-------|-------|------------|-------|
| Wrench v2 | — | — | Initial fine-tune; not benchmarked on this version of the suite. |
| Wrench v3 | — | — | Improved dataset; not benchmarked on this version of the suite. |
| **Wrench v4** | **72/75** | **96.0%** | Current release. 3 points lost to minor response quality issues. |

### Frontier Model Comparison (Estimated)

These scores are estimates based on running the same 25-prompt suite against frontier models with equivalent tool definitions. They provide context for interpreting the Wrench v4 score.

| Model | Estimated Score | Percentage | Notes |
|-------|----------------|------------|-------|
| Claude Sonnet 4.5 | ~73/75 | ~97.3% | Near-perfect tool use; occasional verbosity costs a point. |
| GPT-4o | ~70/75 | ~93.3% | Strong but occasionally ignores tools for "easy" questions (Category 5). |
| Base Qwen 3.5 35B | ~40/75 | ~53.3% | Without fine-tuning, frequently refuses tool calls or hallucinates arguments. This is the base model Wrench is fine-tuned from. |

### Key Takeaway

Wrench v4 closes the gap between a 35B local model and frontier APIs. The base Qwen 3.5 35B scores roughly 40/75 — fine-tuning with the Wrench dataset brings that to 72/75, a **32-point improvement** that puts it within 1-3 points of models 10x its parameter count running on cloud infrastructure.

---

## How to Run

### Prerequisites

- A running instance of [Clank Gateway](https://github.com/ItsTrag1c/Clank) with the target model configured.
- A tool-calling runtime that supports the 10 tools listed in the system prompt (or mocked equivalents).
- A filesystem with the test paths created (or tolerance for "file not found" responses in error recovery prompts).

### Steps

1. Configure Clank Gateway to route to the model you want to benchmark.
2. Set the system prompt exactly as specified in the [Methodology](#methodology) section.
3. Send each of the 25 prompts as an isolated conversation (no context carryover).
4. Score each response using the [Scoring Criteria](#scoring-criteria) rubric.
5. Sum the scores. Maximum is 75.

### Optional: Filesystem Setup

For a clean run, create a minimal test filesystem:

```bash
mkdir -p /home/user/{app/src,projects,logs,repo,data}
echo '{"port": 3000, "host": "localhost"}' > /home/user/config.json
echo '{"database": {"host": "db.internal.local"}}' > /home/user/app/config.yaml
cd /home/user/repo && git init
```

This is not strictly required — the benchmark evaluates whether the model **calls the right tools with the right arguments**, not whether the tools return successful results.

---

## Frontier Comparison

The frontier estimates exist to answer one question: **how good is good enough?**

A score of 72/75 does not mean much in isolation. Comparing against Claude Sonnet 4.5 (~73) and GPT-4o (~70) shows that Wrench v4 is operating at frontier-equivalent accuracy for tool-calling tasks, despite running locally on consumer hardware.

The base Qwen 3.5 35B score (~40/75) demonstrates the magnitude of the fine-tuning improvement. Without targeted training on tool-calling patterns, even a capable 35B model fails the majority of agent tasks — not because it lacks knowledge, but because it defaults to text responses instead of tool calls.

---

## Interpretation Guide

### What the scores mean

- **70-75 (93-100%):** Production-ready for agent workloads. The model reliably uses tools and produces quality responses.
- **55-69 (73-92%):** Usable but expect occasional failures. May need retry logic or human oversight.
- **40-54 (53-72%):** Unreliable for autonomous agent use. Will frequently skip tool calls or produce malformed arguments.
- **Below 40 (<53%):** Not suitable for tool-calling workloads without significant fine-tuning or prompt engineering.

### What this benchmark does NOT measure

- **General knowledge or reasoning ability.** This benchmark only tests tool-calling behavior.
- **Long-context performance.** All prompts are short, single-turn interactions.
- **Latency or throughput.** Speed is not scored.
- **Safety or alignment.** The benchmark does not test refusal behavior on harmful prompts.

### Limitations

- Frontier scores are estimates, not rigorous evaluations. They are included for directional comparison only.
- The benchmark assumes a specific set of 10 tools. Models fine-tuned for different tool schemas may score differently.
- Scoring is deterministic for scores 0 and 1 but involves some judgment for distinguishing 2 from 3. When in doubt, score conservatively (give the 2).

---

*This benchmark is part of the [Clank](https://github.com/ItsTrag1c/Clank) project, licensed under Apache 2.0.*
