import { getDb } from "@/lib/cloudflare";
import { evaluateGuardrails, type GuardrailRule } from "@/lib/agent/guardrails";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";

export type ActionRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  type: string;
  enabled: number;
  requires_confirmation: number;
  is_sensitive: number;
  config: string | null;
  input_schema: string | null;
};

export type VerifiedIdentity = Record<string, string | number | boolean | null>;

export function actionsToPrompt(actions: ActionRow[]) {
  return actions
    .filter((a) => a.enabled)
    .map((a) => {
      const schema = a.input_schema || "{}";
      return `- ${a.slug}: ${a.description || a.name}${a.is_sensitive ? " [SENSITIVE]" : ""}${a.requires_confirmation ? " [CONFIRM]" : ""}\n  input: ${schema}`;
    })
    .join("\n");
}

export async function listAgentActions(agentId: string) {
  const db = await getDb();
  const rows = await db
    .prepare(`SELECT * FROM actions WHERE agent_id = ? AND enabled = 1`)
    .bind(agentId)
    .all<ActionRow>();
  return rows.results || [];
}

/**
 * Execute an action server-side. Secrets never go to the model or browser.
 * Identity-aware: verified identity is injected; model cannot spoof customer_id.
 */
export async function executeAction(input: {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  action: ActionRow;
  args: Record<string, unknown>;
  verifiedIdentity?: VerifiedIdentity | null;
  guardrails: GuardrailRule[];
  confirmed?: boolean;
}) {
  const db = await getDb();
  const decision = evaluateGuardrails({
    rules: input.guardrails,
    scope: "pre_tool",
    message: input.action.slug,
    toolName: input.action.slug,
    toolSensitive: Boolean(input.action.is_sensitive),
  });

  if (!decision.allow) {
    return { ok: false as const, error: decision.message || "Blocked by guardrail" };
  }

  if ((decision.requireConfirmation || input.action.requires_confirmation) && !input.confirmed) {
    const execId = createId("aex");
    await db
      .prepare(
        `INSERT INTO action_executions
        (id, workspace_id, agent_id, action_id, conversation_id, name, status, input, requires_confirmation, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'awaiting_confirmation', ?, 1, ?)`,
      )
      .bind(
        execId,
        input.workspaceId,
        input.agentId,
        input.action.id,
        input.conversationId || null,
        input.action.slug,
        JSON.stringify(input.args),
        nowIso(),
      )
      .run();
    return {
      ok: false as const,
      needsConfirmation: true,
      executionId: execId,
      error: decision.message || "Confirmation required before running this action.",
    };
  }

  const started = Date.now();
  const execId = createId("aex");
  const config = safeJsonParse<{
    url?: string;
    method?: string;
    headers?: Record<string, string>;
    demo?: boolean;
    mockResponse?: Record<string, unknown>;
  }>(input.action.config, {});

  // Merge verified identity into args for authorization — model-supplied identity is ignored for trusted keys
  const trustedArgs = { ...input.args };
  if (input.verifiedIdentity) {
    for (const key of ["customer_id", "email", "account_id", "organization_id", "subscription_id", "session_id"]) {
      if (input.verifiedIdentity[key] != null) {
        trustedArgs[key] = input.verifiedIdentity[key];
      }
    }
  }

  try {
    let output: unknown;

    if (config.demo || input.action.slug === "lookup_order") {
      const mock = config.mockResponse || {
        orderId: String(trustedArgs.order_id || "ORD-1001"),
        status: "Shipped",
        eta: "2–3 business days",
        trackingUrl: "https://example.com/track/ORD-1001",
      };
      output = JSON.parse(
        JSON.stringify(mock).replace(/\{\{(\w+)\}\}/g, (_, k: string) => String(trustedArgs[k] ?? "")),
      );
    } else if (config.url) {
      const method = (config.method || "GET").toUpperCase();
      const res = await fetch(config.url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(config.headers || {}),
        },
        body: method === "GET" || method === "HEAD" ? undefined : JSON.stringify(trustedArgs),
        signal: AbortSignal.timeout(15000),
      });
      const text = await res.text();
      try {
        output = JSON.parse(text);
      } catch {
        output = { status: res.status, body: text.slice(0, 2000) };
      }
      if (!res.ok) throw new Error(`Action HTTP ${res.status}`);
    } else {
      output = { ok: true, message: "Action has no endpoint configured (demo stub)." };
    }

    const latency = Date.now() - started;
    await db
      .prepare(
        `INSERT INTO action_executions
        (id, workspace_id, agent_id, action_id, conversation_id, name, status, input, output, latency_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'succeeded', ?, ?, ?, ?)`,
      )
      .bind(
        execId,
        input.workspaceId,
        input.agentId,
        input.action.id,
        input.conversationId || null,
        input.action.slug,
        JSON.stringify(trustedArgs),
        JSON.stringify(output),
        latency,
        nowIso(),
      )
      .run();

    return { ok: true as const, executionId: execId, output, latencyMs: latency };
  } catch (error) {
    await db
      .prepare(
        `INSERT INTO action_executions
        (id, workspace_id, agent_id, action_id, conversation_id, name, status, input, error, latency_ms, created_at)
        VALUES (?, ?, ?, ?, ?, ?, 'failed', ?, ?, ?, ?)`,
      )
      .bind(
        execId,
        input.workspaceId,
        input.agentId,
        input.action.id,
        input.conversationId || null,
        input.action.slug,
        JSON.stringify(trustedArgs),
        error instanceof Error ? error.message : "Action failed",
        Date.now() - started,
        nowIso(),
      )
      .run();
    return {
      ok: false as const,
      executionId: execId,
      error: error instanceof Error ? error.message : "Action failed",
    };
  }
}

/** Detect simple tool intent from user message for demo/runtime without full function-calling loop */
export function detectActionIntent(message: string, actions: ActionRow[]): { action: ActionRow; args: Record<string, unknown> } | null {
  const m = message.toLowerCase();
  const orderMatch = message.match(/\b(?:order|#)\s*([A-Z0-9-]{4,})\b/i);
  for (const action of actions) {
    if (action.slug === "lookup_order" && /(where is my order|order status|track.*(order|package)|lookup order)/i.test(m)) {
      return {
        action,
        args: { order_id: orderMatch?.[1] || "ORD-1001" },
      };
    }
  }
  return null;
}
