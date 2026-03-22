/**
 * Gateway JSON-RPC protocol — frame types and constants.
 *
 * All communication between clients (CLI, Web, Desktop) and the gateway
 * uses these frame types over WebSocket. This is the same pattern as
 * the old sidecar protocol, just over WebSocket instead of stdio.
 */

/** Client → Server: initial handshake */
export interface ConnectParams {
  type: "connect";
  token?: string;
  clientName: string;
  protocolVersion: number;
}

/** Server → Client: handshake response */
export interface HelloOk {
  type: "hello";
  ok: boolean;
  version: string;
  agentId: string;
  sessionKey: string;
  error?: string;
}

/** Client → Server: request */
export interface RequestFrame {
  type: "req";
  id: number | string;
  method: string;
  params?: Record<string, unknown>;
}

/** Server → Client: response */
export interface ResponseFrame {
  type: "res";
  id: number | string;
  ok: boolean;
  payload?: unknown;
  error?: string;
}

/** Server → Client: event (streaming, tool updates, etc.) */
export interface EventFrame {
  type: "event";
  event: string;
  payload: unknown;
  seq: number;
}

export type Frame = ConnectParams | HelloOk | RequestFrame | ResponseFrame | EventFrame;

/** Protocol version */
export const PROTOCOL_VERSION = 1;

/** Default gateway port */
export const DEFAULT_PORT = 18789;

/** Known request methods */
export const METHODS = {
  CONNECT: "connect",
  SEND_MESSAGE: "sendMessage",
  CANCEL: "cancel",
  SESSIONS_LIST: "sessions/list",
  SESSIONS_RESOLVE: "sessions/resolve",
  SESSIONS_RESET: "sessions/reset",
  SESSIONS_DELETE: "sessions/delete",
  SESSIONS_COMPACT: "sessions/compact",
} as const;

/** Known event types */
export const EVENTS = {
  TOKEN: "token",
  RESPONSE_START: "response-start",
  RESPONSE_END: "response-end",
  TOOL_START: "tool-start",
  TOOL_RESULT: "tool-result",
  CONFIRM_NEEDED: "confirm-needed",
  CONTEXT_COMPACTING: "context-compacting",
  USAGE: "usage",
  ERROR: "error",
  TURN_COMPLETE: "turn-complete",
} as const;

/** Parse a raw WebSocket message into a Frame */
export function parseFrame(data: string): Frame | null {
  try {
    return JSON.parse(data) as Frame;
  } catch {
    return null;
  }
}

/** Serialize a frame to send over WebSocket */
export function serializeFrame(frame: Frame): string {
  return JSON.stringify(frame);
}
