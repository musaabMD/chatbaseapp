import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";

export type HelpdeskPayload = {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  escalationId: string;
  summary: string;
  reason: string;
  priority: string;
  transcript?: string[];
  customer?: Record<string, unknown>;
};

export type AdapterResult = {
  provider: string;
  status: "queued" | "skipped" | "failed";
  externalId?: string;
  payload: Record<string, unknown>;
};

/**
 * Translate canonical escalation into provider-shaped ticket payloads.
 * Real OAuth/API calls wire in when secrets exist; otherwise queue outbound events.
 */
export async function dispatchHelpdeskHandoff(input: HelpdeskPayload): Promise<AdapterResult[]> {
  const db = await getDb();
  const integrations = await db
    .prepare(
      `SELECT id, type, name, status, config FROM integrations WHERE workspace_id = ? AND status = 'connected'`,
    )
    .bind(input.workspaceId)
    .all<{ id: string; type: string; name: string; config: string | null }>();

  const results: AdapterResult[] = [];
  const list = integrations.results || [];

  // Always record built-in inbox destination
  results.push({
    provider: "campusly_inbox",
    status: "queued",
    externalId: input.escalationId,
    payload: {
      type: "internal_ticket",
      escalationId: input.escalationId,
      conversationId: input.conversationId,
      summary: input.summary,
    },
  });

  for (const integ of list) {
    const config = safeJsonParse<Record<string, unknown>>(integ.config, {});
    const shaped = shapeForProvider(integ.type, input, config);
    const result: AdapterResult = {
      provider: integ.type,
      status: "queued",
      payload: shaped,
    };

    await db
      .prepare(
        `INSERT INTO channel_events
        (id, workspace_id, agent_id, conversation_id, channel, direction, payload, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'outbound', ?, 'queued', ?)`,
      )
      .bind(
        createId("cevt"),
        input.workspaceId,
        input.agentId,
        input.conversationId,
        integ.type,
        JSON.stringify({
          adapter: integ.type,
          escalationId: input.escalationId,
          shaped,
        }),
        nowIso(),
      )
      .run();

    results.push(result);
  }

  return results;
}

function shapeForProvider(
  type: string,
  input: HelpdeskPayload,
  config: Record<string, unknown>,
): Record<string, unknown> {
  const base = {
    subject: `Campusly escalation: ${input.reason}`,
    body: input.summary,
    priority: input.priority,
    tags: ["campusly", "ai-escalation", input.reason],
    conversation_id: input.conversationId,
    escalation_id: input.escalationId,
    customer: input.customer || {},
    transcript: input.transcript || [],
    config_keys: Object.keys(config),
  };

  switch (type) {
    case "zendesk":
      return {
        ticket: {
          subject: base.subject,
          comment: { body: `${input.summary}\n\n---\nAI summary + transcript from Campusly` },
          priority: mapPriority(input.priority),
          tags: base.tags,
          external_id: input.escalationId,
        },
      };
    case "intercom":
      return {
        type: "conversation",
        message_type: "inapp",
        body: input.summary,
        ai_summary: input.summary,
        transcript: input.transcript,
        custom_attributes: {
          campusly_escalation_id: input.escalationId,
          campusly_reason: input.reason,
        },
      };
    case "gorgias":
    case "freshdesk":
    case "helpscout":
    case "hubspot":
    case "salesforce":
    case "zoho":
    case "odoo":
      return {
        case: base,
        provider: type,
      };
    default:
      return base;
  }
}

function mapPriority(p: string) {
  if (p === "urgent") return "urgent";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "normal";
}
