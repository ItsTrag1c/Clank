/**
 * OpenAI provider — also used for OpenAI-compatible local servers
 * like LM Studio, vLLM, and llama.cpp.
 *
 * The constructor takes a baseUrl so it can point to any
 * OpenAI-compatible endpoint. The `isLocal` flag adjusts behavior
 * (e.g., context window defaults, response token caps).
 */

import {
  BaseProvider,
  type Message,
  type StreamEvent,
  type ToolDefinition,
} from "./types.js";

const CONTEXT_WINDOWS: Record<string, number> = {
  "gpt-4o": 128000,
  "gpt-4o-mini": 128000,
  "gpt-4-turbo": 128000,
  "gpt-4": 8192,
  "gpt-3.5-turbo": 16385,
};

export class OpenAIProvider extends BaseProvider {
  readonly name = "openai";
  private baseUrl: string;
  private apiKey: string;
  private model: string;
  private isLocal: boolean;
  private maxResponseTokens?: number;

  constructor(opts: {
    baseUrl?: string;
    apiKey?: string;
    model: string;
    isLocal?: boolean;
    maxResponseTokens?: number;
  }) {
    super();
    this.baseUrl = (opts.baseUrl || "https://api.openai.com").replace(/\/$/, "");
    this.apiKey = opts.apiKey || "";
    this.model = opts.model;
    this.isLocal = opts.isLocal ?? false;
    this.maxResponseTokens = opts.maxResponseTokens;
  }

  /**
   * Detect an OpenAI-compatible server by probing /v1/models.
   */
  static async detect(baseUrl: string): Promise<string[] | null> {
    try {
      const res = await fetch(`${baseUrl}/v1/models`, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const data = (await res.json()) as { data?: Array<{ id: string }> };
      return data.data?.map((m) => m.id) ?? [];
    } catch {
      return null;
    }
  }

  contextWindow(): number {
    if (this.isLocal) return 32768;
    return CONTEXT_WINDOWS[this.model] ?? 128000;
  }

  formatTools(tools: ToolDefinition[]): unknown[] {
    return tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));
  }

  private prepareMessages(
    messages: Message[],
    systemPrompt: string,
  ): Array<Record<string, unknown>> {
    const result: Array<Record<string, unknown>> = [];

    if (systemPrompt) {
      result.push({ role: "system", content: systemPrompt });
    }

    for (const msg of messages) {
      if (msg.role === "system") continue;

      if (msg.role === "tool") {
        result.push({
          role: "tool",
          tool_call_id: msg.tool_call_id,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      } else if (msg.role === "assistant" && msg.tool_calls) {
        result.push({
          role: "assistant",
          content: typeof msg.content === "string" && msg.content ? msg.content : null,
          tool_calls: msg.tool_calls,
        });
      } else {
        result.push({
          role: msg.role,
          content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content),
        });
      }
    }

    return result;
  }

  async *stream(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    // Sanitize messages — remove orphaned tool results (no matching tool_call)
    // which cause 400 errors from OpenAI-compatible APIs including llama.cpp
    const toolCallIds = new Set<string>();
    for (const msg of messages) {
      if (msg.role === "assistant" && msg.tool_calls) {
        for (const tc of msg.tool_calls) toolCallIds.add(tc.id);
      }
    }
    const sanitized = messages.filter((msg) => {
      if (msg.role === "tool" && msg.tool_call_id && !toolCallIds.has(msg.tool_call_id)) {
        return false;
      }
      return true;
    });

    const body: Record<string, unknown> = {
      model: this.model,
      messages: this.prepareMessages(sanitized, systemPrompt),
      stream: true,
      stream_options: { include_usage: true },
    };

    // For local thinking models (Qwen3.5, etc.), minimize reasoning overhead
    // so more tokens go to actual content and tool calls
    if (this.isLocal) {
      body.reasoning_effort = "low";
    }

    if (tools.length > 0) {
      body.tools = this.formatTools(tools);
    }

    // Always set max_tokens for local models — thinking models (like Qwen3.5)
    // generate reasoning tokens that eat the context window. Without a cap,
    // the model can exhaust all space on thinking and never produce content.
    if (this.maxResponseTokens) {
      body.max_tokens = this.maxResponseTokens;
    } else if (this.isLocal) {
      body.max_tokens = 4096;
    }

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }

    // Two-layer timeout:
    // 1. Overall timeout (5min local, 90s cloud)
    // 2. Per-chunk idle timeout (detects mid-stream hangs)
    const timeoutMs = this.isLocal ? 300_000 : 90_000;
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const effectiveSignal = signal
      ? AbortSignal.any([signal, timeoutSignal])
      : timeoutSignal;

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: effectiveSignal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "Unknown error");
      throw new Error(`OpenAI API error ${res.status}: ${text}`);
    }

    if (!res.body) throw new Error("No response body from OpenAI");

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedDone = false;
    let lastFinishReason: string | null = null;
    let hasContent = false;
    const toolCalls = new Map<number, { id: string; name: string; arguments: string }>();

    // Per-chunk idle timeout — if the model stops sending data, abort early
    // instead of waiting for the overall timeout. Local models get 60s
    // (large quantized models are slower), cloud gets 30s.
    const CHUNK_IDLE_TIMEOUT = this.isLocal ? 60_000 : 30_000;

    try {
      while (true) {
        const idleTimeout = new Promise<{ done: true; value: undefined }>((_, reject) =>
          setTimeout(() => reject(new Error("Model stopped responding (no data received)")), CHUNK_IDLE_TIMEOUT),
        );

        const { done, value } = await Promise.race([
          reader.read(),
          idleTimeout,
        ]);
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith("data: ")) continue;

          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            receivedDone = true;
            for (const tc of toolCalls.values()) {
              let parsedArgs: Record<string, unknown> = {};
              try {
                parsedArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
              } catch {
                parsedArgs = {};
              }
              yield { type: "tool_call", id: tc.id, name: tc.name, arguments: parsedArgs };
            }
            yield { type: "done" };
            return;
          }

          try {
            const chunk = JSON.parse(data) as {
              choices?: Array<{
                delta?: {
                  content?: string | null;
                  reasoning_content?: string | null;
                  tool_calls?: Array<{
                    index: number;
                    id?: string;
                    function?: { name?: string; arguments?: string };
                  }>;
                };
                finish_reason?: string | null;
              }>;
              usage?: { prompt_tokens?: number; completion_tokens?: number };
            };

            const choice = chunk.choices?.[0];

            // Track finish_reason to detect truncation vs normal completion
            if (choice?.finish_reason) {
              lastFinishReason = choice.finish_reason;
            }

            if (choice?.delta?.reasoning_content) {
              hasContent = true;
              if (this.isLocal) {
                // Local thinking models (Qwen3.5, etc.) often put ALL output
                // in reasoning_content with empty content. Treat reasoning as
                // text so the user actually sees a response.
                yield { type: "text", content: choice.delta.reasoning_content };
              } else {
                yield { type: "thinking", content: choice.delta.reasoning_content };
              }
            }
            if (choice?.delta?.content) {
              hasContent = true;
              yield { type: "text", content: choice.delta.content };
            }

            if (choice?.delta?.tool_calls) {
              hasContent = true;
              for (const tc of choice.delta.tool_calls) {
                const existing = toolCalls.get(tc.index);
                if (existing) {
                  if (tc.function?.arguments) existing.arguments += tc.function.arguments;
                } else {
                  toolCalls.set(tc.index, {
                    id: tc.id || `call_${tc.index}`,
                    name: tc.function?.name || "",
                    arguments: tc.function?.arguments || "",
                  });
                }
              }
            }

            if (chunk.usage) {
              yield {
                type: "usage",
                promptTokens: chunk.usage.prompt_tokens ?? 0,
                outputTokens: chunk.usage.completion_tokens ?? 0,
              };
            }
          } catch {
            // Skip malformed chunks
          }
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Stream ended without [DONE] — connection dropped or model crashed
    if (!receivedDone && hasContent) {
      for (const tc of toolCalls.values()) {
        let parsedArgs: Record<string, unknown> = {};
        try {
          parsedArgs = JSON.parse(tc.arguments) as Record<string, unknown>;
        } catch {
          parsedArgs = {};
        }
        yield { type: "tool_call", id: tc.id, name: tc.name, arguments: parsedArgs };
      }
      throw new Error(
        lastFinishReason === "length"
          ? "Model response truncated (hit token limit)"
          : "Model stream ended unexpectedly (connection dropped)",
      );
    }

    if (!receivedDone) {
      throw new Error("Model returned empty response");
    }

    yield { type: "done" };
  }

  formatAssistantToolUse(
    toolCallId: string,
    name: string,
    args: Record<string, unknown>,
  ): Message {
    return {
      role: "assistant",
      content: "",
      tool_calls: [
        {
          id: toolCallId,
          type: "function",
          function: { name, arguments: JSON.stringify(args) },
        },
      ],
    };
  }

  formatToolResult(
    toolCallId: string,
    _name: string,
    result: string,
    _isError?: boolean,
  ): Message {
    return {
      role: "tool",
      content: result,
      tool_call_id: toolCallId,
    };
  }
}
