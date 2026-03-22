/**
 * Prompt fallback provider.
 *
 * Wraps any provider to add tool support for models that don't have
 * native function calling. Instead of passing tools via the API, it:
 *
 * 1. Injects tool definitions into the system prompt as JSON specs
 * 2. Asks the model to respond with a specific format when using tools
 * 3. Parses the model's text output to extract tool calls via regex
 *
 * This is how smaller local models (llama3.2 3B, phi-3, etc.) can
 * still use tools — they just need to follow a text format instead
 * of producing structured function calls.
 */

import {
  BaseProvider,
  type Message,
  type StreamEvent,
  type ToolDefinition,
} from "./types.js";

const TOOL_PROMPT_TEMPLATE = `
You have access to the following tools. To use a tool, respond with a JSON block in this exact format:

\`\`\`tool_call
{"name": "tool_name", "arguments": {"arg1": "value1"}}
\`\`\`

Available tools:
`;

/** Regex to extract tool calls from model text output */
const TOOL_CALL_REGEX = /```tool_call\s*\n?\s*(\{[\s\S]*?\})\s*\n?\s*```/g;

export class PromptFallbackProvider extends BaseProvider {
  readonly name: string;
  private wrapped: BaseProvider;

  constructor(wrapped: BaseProvider) {
    super();
    this.wrapped = wrapped;
    this.name = `${wrapped.name}+prompt-fallback`;
  }

  contextWindow(): number {
    return this.wrapped.contextWindow();
  }

  formatTools(_tools: ToolDefinition[]): unknown[] {
    // Tools are injected into the prompt, not passed to the API
    return [];
  }

  /**
   * Build the tool injection block for the system prompt.
   */
  private buildToolPrompt(tools: ToolDefinition[]): string {
    if (tools.length === 0) return "";

    let prompt = TOOL_PROMPT_TEMPLATE;
    for (const tool of tools) {
      prompt += `\n### ${tool.name}\n`;
      prompt += `${tool.description}\n`;
      prompt += `Parameters: ${JSON.stringify(tool.parameters, null, 2)}\n`;
    }
    prompt += "\nYou can use multiple tools in one response. After each tool call, wait for the result before proceeding.\n";
    prompt += "If you don't need a tool, just respond normally with text.\n";
    return prompt;
  }

  async *stream(
    messages: Message[],
    systemPrompt: string,
    tools: ToolDefinition[],
    signal?: AbortSignal,
  ): AsyncGenerator<StreamEvent> {
    // Inject tools into system prompt
    const augmentedPrompt = tools.length > 0
      ? systemPrompt + "\n\n" + this.buildToolPrompt(tools)
      : systemPrompt;

    // Collect the full response to parse for tool calls
    let fullText = "";

    for await (const event of this.wrapped.stream(messages, augmentedPrompt, [], signal)) {
      if (event.type === "text") {
        fullText += event.content;
        yield event;
      } else if (event.type === "done") {
        // Parse tool calls from the accumulated text
        const toolCalls = this.parseToolCalls(fullText);
        for (const tc of toolCalls) {
          yield tc;
        }
        yield event;
      } else {
        yield event;
      }
    }
  }

  /**
   * Parse tool calls from model text output.
   */
  private parseToolCalls(text: string): StreamEvent[] {
    const calls: StreamEvent[] = [];
    let match: RegExpExecArray | null;
    let callIndex = 0;

    // Reset regex state
    TOOL_CALL_REGEX.lastIndex = 0;

    while ((match = TOOL_CALL_REGEX.exec(text)) !== null) {
      try {
        const parsed = JSON.parse(match[1]) as {
          name?: string;
          arguments?: Record<string, unknown>;
        };

        if (parsed.name) {
          calls.push({
            type: "tool_call",
            id: `prompt_call_${callIndex++}`,
            name: parsed.name,
            arguments: parsed.arguments ?? {},
          });
        }
      } catch {
        // Malformed JSON in tool call block — skip
      }
    }

    return calls;
  }

  formatAssistantToolUse(
    toolCallId: string,
    name: string,
    args: Record<string, unknown>,
  ): Message {
    // For prompt-based tools, represent the tool call as text in the
    // assistant message so the model sees its own format
    return {
      role: "assistant",
      content: `\`\`\`tool_call\n${JSON.stringify({ name, arguments: args })}\n\`\`\``,
    };
  }

  formatToolResult(
    _toolCallId: string,
    name: string,
    result: string,
    isError?: boolean,
  ): Message {
    const prefix = isError ? `Error from ${name}` : `Result from ${name}`;
    return {
      role: "user",
      content: `${prefix}:\n${result}`,
    };
  }
}
