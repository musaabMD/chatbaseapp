import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { normalizeQuestion } from "@/lib/agent/classify";

/**
 * Track questions with weak retrieval / no grounding as knowledge gaps,
 * and cluster high-volume questions for "what customers keep asking".
 */
export async function recordConversationSignals(input: {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  question: string;
  confidence: number;
  chunkCount: number;
  escalated?: boolean;
  negativeFeedback?: boolean;
}) {
  const db = await getDb();
  const norm = normalizeQuestion(input.question);
  if (!norm || norm.length < 4) return;

  // Top questions cluster
  const existingQ = await db
    .prepare(`SELECT id, occurrence_count FROM question_clusters WHERE agent_id = ? AND question_norm = ?`)
    .bind(input.agentId, norm)
    .first<{ id: string; occurrence_count: number }>();

  if (existingQ) {
    await db
      .prepare(
        `UPDATE question_clusters
         SET occurrence_count = ?, sample_conversation_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(existingQ.occurrence_count + 1, input.conversationId, nowIso(), existingQ.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO question_clusters
        (id, workspace_id, agent_id, canonical_question, question_norm, occurrence_count, sample_conversation_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        createId("qcl"),
        input.workspaceId,
        input.agentId,
        input.question.slice(0, 240),
        norm,
        input.conversationId,
        nowIso(),
        nowIso(),
      )
      .run();
  }

  const isGap =
    input.confidence < 0.4 ||
    input.chunkCount === 0 ||
    Boolean(input.escalated && /missing|unsupported|don't know|cannot confirm/i.test(input.question)) ||
    Boolean(input.negativeFeedback);

  if (!isGap) return;

  const existingGap = await db
    .prepare(`SELECT id, occurrence_count FROM knowledge_gaps WHERE agent_id = ? AND question_norm = ? AND status = 'open'`)
    .bind(input.agentId, norm)
    .first<{ id: string; occurrence_count: number }>();

  if (existingGap) {
    await db
      .prepare(
        `UPDATE knowledge_gaps
         SET occurrence_count = ?, avg_confidence = ?, last_conversation_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .bind(
        existingGap.occurrence_count + 1,
        input.confidence,
        input.conversationId,
        nowIso(),
        existingGap.id,
      )
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO knowledge_gaps
        (id, workspace_id, agent_id, question, question_norm, occurrence_count, avg_confidence, last_conversation_id, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 1, ?, ?, 'open', ?, ?)`,
      )
      .bind(
        createId("gap"),
        input.workspaceId,
        input.agentId,
        input.question.slice(0, 400),
        norm,
        input.confidence,
        input.conversationId,
        nowIso(),
        nowIso(),
      )
      .run();
  }
}

export async function listKnowledgeGaps(workspaceId: string, agentId?: string, limit = 20) {
  const db = await getDb();
  if (agentId) {
    return (
      await db
        .prepare(
          `SELECT * FROM knowledge_gaps WHERE workspace_id = ? AND agent_id = ? AND status = 'open'
           ORDER BY occurrence_count DESC, updated_at DESC LIMIT ?`,
        )
        .bind(workspaceId, agentId, limit)
        .all()
    ).results;
  }
  return (
    await db
      .prepare(
        `SELECT * FROM knowledge_gaps WHERE workspace_id = ? AND status = 'open'
         ORDER BY occurrence_count DESC, updated_at DESC LIMIT ?`,
      )
      .bind(workspaceId, limit)
      .all()
  ).results;
}

export async function listTopQuestions(workspaceId: string, agentId?: string, limit = 15) {
  const db = await getDb();
  if (agentId) {
    return (
      await db
        .prepare(
          `SELECT * FROM question_clusters WHERE workspace_id = ? AND agent_id = ?
           ORDER BY occurrence_count DESC LIMIT ?`,
        )
        .bind(workspaceId, agentId, limit)
        .all()
    ).results;
  }
  return (
    await db
      .prepare(
        `SELECT * FROM question_clusters WHERE workspace_id = ?
         ORDER BY occurrence_count DESC LIMIT ?`,
      )
      .bind(workspaceId, limit)
      .all()
  ).results;
}
