/**
 * Context engine — manages conversation context and compaction.
 *
 * This is one of the most critical pieces for local model optimization.
 * Cloud models have 128K-200K context windows; local models typically
 * have 8K-32K. Aggressive, smart compaction is what makes the difference
 * between a usable local agent and one that constantly errors out.
 *
 * Compaction strategy:
 * 1. Protected zone: last 6 messages are never touched
 * 2. Tool results >500 chars get summarized (first 3 + last 2 lines)
 * 3. Long assistant messages >3000 chars get truncated
 * 4. Oldest messages get dropped when all else fails
 */

import type { Message } from "../providers/types.js";

export interface CompactionResult {
  ok: boolean;
  messagesBefore: number;
  messagesAfter: number;
  estimatedTokensBefore: number;
  estimatedTokensAfter: number;
}

export class ContextEngine {
  private messages: Message[] = [];
  private contextWindowSize: number;
  private isLocal: boolean;

  constructor(opts: { contextWindow: number; isLocal: boolean }) {
    this.contextWindowSize = opts.contextWindow;
    this.isLocal = opts.isLocal;
  }

  /** Get all messages */
  getMessages(): Message[] {
    return this.messages;
  }

  /** Set messages (e.g., when loading a session) */
  setMessages(messages: Message[]): void {
    this.messages = [...messages];
  }

  /** Add a message to the context */
  ingest(message: Message): void {
    this.messages.push(message);
  }

  /** Add multiple messages */
  ingestBatch(messages: Message[]): void {
    this.messages.push(...messages);
  }

  /**
   * Estimate total tokens in the current context.
   * Uses ~4 chars per token as a rough estimate.
   */
  estimateTokens(): number {
    let chars = 0;
    for (const msg of this.messages) {
      if (typeof msg.content === "string") {
        chars += msg.content.length;
      } else {
        chars += JSON.stringify(msg.content).length;
      }
    }
    return Math.ceil(chars / 4);
  }

  /**
   * Get the context utilization as a percentage.
   */
  utilizationPercent(): number {
    return (this.estimateTokens() / this.contextWindowSize) * 100;
  }

  /**
   * Check if compaction is needed.
   * Local models trigger earlier (60%) to leave room for the response.
   * Cloud models can wait longer (80%) since they have larger windows.
   */
  needsCompaction(): boolean {
    const threshold = this.isLocal ? 60 : 80;
    return this.utilizationPercent() >= threshold;
  }

  /**
   * Compact the context to fit within the context window.
   *
   * This is the key local-model optimization. We aggressively
   * reduce context while preserving the most important information:
   * - Recent messages (protected zone)
   * - System-level context
   * - Key decision points
   */
  compact(): CompactionResult {
    const before = this.messages.length;
    const tokensBefore = this.estimateTokens();

    // Protected zone: keep last 6 messages untouched
    const protectedCount = 6;
    const protectedZone = this.messages.slice(-protectedCount);
    const compactable = this.messages.slice(0, -protectedCount);

    const compacted: Message[] = [];

    for (const msg of compactable) {
      if (msg._compacted) {
        // Already compacted — keep as is
        compacted.push(msg);
        continue;
      }

      const content = typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content);

      if (msg.role === "tool") {
        // Summarize long tool results
        if (content.length > 500) {
          const lines = content.split("\n");
          const summary = [
            ...lines.slice(0, 3),
            `... (${lines.length - 5} lines omitted)`,
            ...lines.slice(-2),
          ].join("\n");
          compacted.push({ ...msg, content: summary, _compacted: true });
        } else {
          compacted.push(msg);
        }
      } else if (msg.role === "assistant") {
        // Truncate long assistant messages
        if (content.length > 3000) {
          compacted.push({
            ...msg,
            content: content.slice(0, 1000) + "\n... (truncated)",
            _compacted: true,
          });
        } else {
          compacted.push(msg);
        }
      } else {
        compacted.push(msg);
      }
    }

    this.messages = [...compacted, ...protectedZone];

    // If still too large, start dropping oldest non-system messages
    while (this.estimateTokens() > this.contextWindowSize * 0.7 && this.messages.length > protectedCount + 2) {
      // Find the first non-system message to drop
      const dropIdx = this.messages.findIndex((m) => m.role !== "system");
      if (dropIdx === -1 || dropIdx >= this.messages.length - protectedCount) break;
      this.messages.splice(dropIdx, 1);
    }

    return {
      ok: true,
      messagesBefore: before,
      messagesAfter: this.messages.length,
      estimatedTokensBefore: tokensBefore,
      estimatedTokensAfter: this.estimateTokens(),
    };
  }

  /** Clear all messages */
  clear(): void {
    this.messages = [];
  }

  /** Update the context window size (e.g., after detecting it from Ollama) */
  setContextWindow(size: number): void {
    this.contextWindowSize = size;
  }
}
