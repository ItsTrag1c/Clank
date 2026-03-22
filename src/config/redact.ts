/**
 * Redact sensitive fields from config before exposing to LLMs or clients.
 *
 * API keys, bot tokens, and auth tokens are replaced with "[REDACTED]"
 * to prevent accidental leakage to cloud LLM providers or WebSocket clients.
 */

const SENSITIVE_KEYS = new Set([
  "apikey", "api_key", "apiKey",
  "token", "bottoken", "botToken",
  "secret", "password", "pin",
]);

export function redactConfig(obj: unknown): unknown {
  if (typeof obj === "string") return obj;
  if (Array.isArray(obj)) return obj.map(redactConfig);
  if (obj && typeof obj === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(key) && typeof value === "string" && value.length > 0) {
        result[key] = "[REDACTED]";
      } else if (typeof value === "object" && value !== null) {
        result[key] = redactConfig(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }
  return obj;
}
