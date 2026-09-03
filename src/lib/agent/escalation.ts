import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";

export type EscalationReason =
  | "human_request"
  | "guardrail_block"
  | "procedure_escalation"
  | "post_model_escalation"
  | "low_confidence"
  | "tool_failure"
  | "sensitive_case"
  | "auth_failed"
  | "business_rule";

export type EscalationInput = {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  reason: EscalationReason | string;
  triggerMessageId?: string;
  priority?: "low" | "normal" | "high" | "urgent";
  destination?: string;
  customerMessage?: string;
};

export type HandoffSummary = {
  customer?: string;
  issue: string;
  account?: string;
  actionsAttempted: string[];
  reason: string;
  sentiment: string;
  transcriptPreview: string[];
};

export async function buildHandoffSummary(input: {
  conversationId: string;
  reason: string;
  customerMessage?: string;
}): Promise<HandoffSummary> {
  const db = await getDb();
  const messages = await db
    .prepare(
      `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`,
    )
    .bind(input.conversationId)
    .all<{ role: string; content: string }>();

  const ordered = (messages.results || []).reverse();
  const actions = await db
    .prepare(
      `SELECT name, status FROM action_executions WHERE conversation_id = ? ORDER BY created_at ASC LIMIT 20`,
    )
    .bind(input.conversationId)
    .all<{ name: string; status: string }>();

  const lastUser =
    input.customerMessage ||
    [...ordered].reverse().find((m) => m.role === "user")?.content ||
    "Customer request";

  const text = ordered.map((m) => m.content).join(" ").toLowerCase();
  let sentiment = "neutral";
  if (/(angry|frustrated|urgent|asap|ridiculous|refund now)/.test(text)) sentiment = "frustrated";
  if (/(thanks|thank you|great|awesome)/.test(text)) sentiment = "positive";

  return {
    issue: lastUser.slice(0, 240),
    actionsAttempted: (actions.results || []).map((a) => `${a.name} (${a.status})`),
    reason: input.reason,
    sentiment,
    transcriptPreview: ordered.slice(-6).map((m) => `${m.role}: ${m.content.slice(0, 160)}`),
  };
}

export function formatHandoffSummary(summary: HandoffSummary) {
  return [
    `Issue: ${summary.issue}`,
    summary.account ? `Account: ${summary.account}` : null,
    summary.actionsAttempted.length
      ? `Actions attempted:\n${summary.actionsAttempted.map((a) => `- ${a}`).join("\n")}`
      : "Actions attempted: none yet",
    `Reason for escalation: ${summary.reason}`,
    `Customer sentiment: ${summary.sentiment}`,
    "",
    "Recent transcript:",
    ...summary.transcriptPreview,
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Create escalation record, pause automation, open ticket — keep same conversation.
 */
export async function escalateConversation(input: EscalationInput) {
  const db = await getDb();
  const summary = await buildHandoffSummary({
    conversationId: input.conversationId,
    reason: input.reason,
    customerMessage: input.customerMessage,
  });
  const summaryText = formatHandoffSummary(summary);
  const escalationId = createId("esc");
  const ticketId = createId("tkt");

  await db
    .prepare(
      `INSERT INTO escalations
      (id, workspace_id, agent_id, conversation_id, ticket_id, reason, trigger_message_id,
       summary, priority, destination, status, metadata, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?)`,
    )
    .bind(
      escalationId,
      input.workspaceId,
      input.agentId,
      input.conversationId,
      ticketId,
      input.reason,
      input.triggerMessageId || null,
      summaryText,
      input.priority || "normal",
      input.destination || "inbox",
      JSON.stringify({ summary }),
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `INSERT INTO tickets
      (id, workspace_id, agent_id, conversation_id, subject, status, priority, summary, escalation_id, ai_summary, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      ticketId,
      input.workspaceId,
      input.agentId,
      input.conversationId,
      `Escalation: ${input.reason}`,
      input.priority || "normal",
      summary.issue.slice(0, 500),
      escalationId,
      summaryText,
      nowIso(),
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `UPDATE conversations
       SET handoff_status = 'escalated',
           automation_state = 'escalating',
           status = 'open',
           resolution = 'ESCALATED',
           updated_at = ?,
           last_message_at = ?,
           metadata = ?
       WHERE id = ?`,
    )
    .bind(
      nowIso(),
      nowIso(),
      JSON.stringify({ escalation_id: escalationId, escalation_reason: input.reason }),
      input.conversationId,
    )
    .run();

  // Notify helpdesk adapters (stub — logs channel event)
  await notifyHelpdeskAdapters({
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    conversationId: input.conversationId,
    escalationId,
    summary: summaryText,
    destination: input.destination || "inbox",
  });

  return { escalationId, ticketId, summary, summaryText };
}

async function notifyHelpdeskAdapters(input: {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  escalationId: string;
  summary: string;
  destination: string;
}) {
  const db = await getDb();
  const integrations = await db
    .prepare(
      `SELECT type, name, status, config FROM integrations WHERE workspace_id = ? AND status = 'connected'`,
    )
    .bind(input.workspaceId)
    .all<{ type: string; name: string; config: string | null }>();

  for (const integ of integrations.results || []) {
    // Adapter stubs: record outbound event; real OAuth providers wire later
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
          summary: input.summary,
          destination: input.destination,
          config: safeJsonParse(integ.config, {}),
        }),
        nowIso(),
      )
      .run();
  }
}

export async function takeOverConversation(input: {
  conversationId: string;
  workspaceId: string;
  assigneeUserId: string;
}) {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations
       SET automation_state = 'human',
           handoff_status = 'human',
           assigned_to = ?,
           updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .bind(input.assigneeUserId, nowIso(), input.conversationId, input.workspaceId)
    .run();

  await db
    .prepare(
      `UPDATE escalations SET status = 'on_you', assigned_user = ? WHERE conversation_id = ? AND status IN ('new', 'on_hold')`,
    )
    .bind(input.assigneeUserId, input.conversationId)
    .run();
}

export async function resolveConversation(input: {
  conversationId: string;
  workspaceId: string;
  resolution?: string;
}) {
  const db = await getDb();
  await db
    .prepare(
      `UPDATE conversations
       SET status = 'closed',
           automation_state = 'resolved',
           handoff_status = 'resolved',
           resolution = ?,
           updated_at = ?
       WHERE id = ? AND workspace_id = ?`,
    )
    .bind(input.resolution || "HUMAN_RESOLVED", nowIso(), input.conversationId, input.workspaceId)
    .run();

  await db
    .prepare(
      `UPDATE escalations SET status = 'closed', resolved_at = ? WHERE conversation_id = ? AND status != 'closed'`,
    )
    .bind(nowIso(), input.conversationId)
    .run();

  await db
    .prepare(
      `UPDATE tickets SET status = 'closed', updated_at = ? WHERE conversation_id = ? AND status != 'closed'`,
    )
    .bind(nowIso(), input.conversationId)
    .run();
}
