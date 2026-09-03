import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

export type AgentTracePayload = {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  messageId?: string;
  input: string;
  intent?: string;
  retrievedContext?: unknown;
  procedureSelection?: unknown;
  llmRun?: unknown;
  toolCalls?: unknown;
  guardrailDecisions?: unknown;
  escalationDecision?: unknown;
  finalResponse?: string;
};

export async function saveAgentTrace(trace: AgentTracePayload) {
  const db = await getDb();
  const id = createId("trace");
  try {
    await db
      .prepare(
        `INSERT INTO agent_traces
        (id, workspace_id, agent_id, conversation_id, message_id, input, intent,
         retrieved_context, procedure_selection, llm_run, tool_calls,
         guardrail_decisions, escalation_decision, final_response, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        trace.workspaceId,
        trace.agentId,
        trace.conversationId || null,
        trace.messageId || null,
        trace.input,
        trace.intent || null,
        JSON.stringify(trace.retrievedContext ?? null),
        JSON.stringify(trace.procedureSelection ?? null),
        JSON.stringify(trace.llmRun ?? null),
        JSON.stringify(trace.toolCalls ?? null),
        JSON.stringify(trace.guardrailDecisions ?? null),
        JSON.stringify(trace.escalationDecision ?? null),
        trace.finalResponse || null,
        nowIso(),
      )
      .run();
  } catch {
    /* table may not exist yet before migration */
  }
  return id;
}
