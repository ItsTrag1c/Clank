/**
 * Multi-agent routing — resolves inbound messages to agents.
 *
 * Uses a binding-based priority system (matching OpenClaw's approach):
 * 1. Exact peer match (DM/group ID)
 * 2. Parent thread inheritance
 * 3. Discord guild + role
 * 4. Guild/team
 * 5. Account-level binding
 * 6. Channel-level catch-all
 * 7. Default agent
 *
 * Config-driven: bindings are defined in config.json5.
 */

export interface RouteBinding {
  agentId: string;
  /** Match criteria (evaluated in priority order) */
  match?: {
    channel?: string;
    peer?: { kind: "dm" | "group" | "channel"; id: string | number };
    guild?: string;
    roles?: string[];
    team?: string;
    account?: string;
  };
  /** Priority override (lower = higher priority) */
  priority?: number;
}

export interface RouteContext {
  channel: string;
  peerId?: string | number;
  peerKind?: "dm" | "group" | "channel";
  guildId?: string;
  roles?: string[];
  teamId?: string;
  accountId?: string;
  threadParentId?: string | number;
}

export interface AgentListEntry {
  id: string;
  name?: string;
}

/**
 * Resolve which agent should handle a message.
 * Evaluates bindings in priority order and returns the best match.
 */
export function resolveRoute(
  context: RouteContext,
  bindings: RouteBinding[],
  agents: AgentListEntry[],
  defaultAgentId: string,
): string {
  // Sort bindings by specificity (most specific first)
  const scored = bindings.map((b) => ({
    binding: b,
    score: scoreBinding(b, context),
  }));

  // Filter to matches and sort by score (highest first)
  const matches = scored
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      // Explicit priority overrides score
      const pA = a.binding.priority ?? 99;
      const pB = b.binding.priority ?? 99;
      if (pA !== pB) return pA - pB;
      return b.score - a.score;
    });

  if (matches.length > 0) {
    const agentId = matches[0].binding.agentId;
    // Verify agent exists
    if (agents.some((a) => a.id === agentId)) {
      return agentId;
    }
  }

  return defaultAgentId;
}

/**
 * Score a binding against a route context.
 * Higher score = more specific match.
 * Returns 0 if the binding doesn't match at all.
 */
function scoreBinding(binding: RouteBinding, context: RouteContext): number {
  const match = binding.match;
  if (!match) return 0;

  let score = 0;

  // Tier 1: Exact peer match (most specific)
  if (match.peer) {
    if (
      match.peer.kind === context.peerKind &&
      String(match.peer.id) === String(context.peerId)
    ) {
      score += 100;
    } else {
      return 0; // Peer specified but doesn't match
    }
  }

  // Tier 2: Guild + roles
  if (match.guild && match.roles) {
    if (
      match.guild === context.guildId &&
      match.roles.some((r) => context.roles?.includes(r))
    ) {
      score += 80;
    } else if (match.guild || match.roles) {
      return 0;
    }
  }

  // Tier 3: Guild only
  if (match.guild && !match.roles) {
    if (match.guild === context.guildId) {
      score += 60;
    } else {
      return 0;
    }
  }

  // Tier 4: Team
  if (match.team) {
    if (match.team === context.teamId) {
      score += 50;
    } else {
      return 0;
    }
  }

  // Tier 5: Account
  if (match.account) {
    if (match.account === context.accountId) {
      score += 30;
    } else {
      return 0;
    }
  }

  // Tier 6: Channel catch-all
  if (match.channel) {
    if (match.channel === context.channel) {
      score += 10;
    } else {
      return 0;
    }
  }

  return score;
}

/**
 * Derive a normalized session key from a route context.
 */
export function deriveSessionKey(context: RouteContext): string {
  if (context.peerKind === "dm") {
    return `dm:${context.channel}:${context.peerId}`;
  }
  if (context.peerKind === "group" || context.peerKind === "channel") {
    return `group:${context.channel}:${context.peerId}`;
  }
  return `${context.channel}:main`;
}
