export { BaseProvider } from "./types.js";
export type {
  StreamEvent,
  ToolDefinition,
  Message,
  ContentBlock,
  ToolCallMessage,
  ModelCompatConfig,
  ResolvedProvider,
  ModelConfig,
} from "./types.js";

export { OllamaProvider } from "./ollama.js";
export { AnthropicProvider } from "./anthropic.js";
export { OpenAIProvider } from "./openai.js";
export { PromptFallbackProvider } from "./prompt-fallback.js";

export {
  parseModelId,
  createProvider,
  resolveWithFallback,
  detectLocalServers,
  type ProviderConfig,
} from "./router.js";
