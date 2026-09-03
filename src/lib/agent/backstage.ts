import { getDb } from "@/lib/cloudflare";
import { createLLMProvider } from "@/lib/llm/provider";
import { createId, nowIso } from "@/lib/utils";
import { listKnowledgeGaps, listTopQuestions } from "@/lib/agent/knowledge-gaps";

export type BackstageToolResult = {
  name: string;
  data: unknown;
};

/**
 * Operator-facing Backstage agent: ask about customers, propose fixes.
 * Suggestions never auto-apply to production — require approval.
 */
export async function runBackstageTurn(input: {
  workspaceId: string;
  agentId?: string;
  message: string;
  userId?: string;
}) {
  const db = await getDb();
  const tools = await gatherBackstageContext(input.workspaceId, input.agentId);
  const llm = await createLLMProvider();

  const system = [
    "You are Campusly Backstage — an internal operator copilot for the people who run customer-facing AI agents.",
    "Answer using the TOOL RESULTS below. Be concise and actionable.",
    "You may propose improvements (FAQ drafts, instruction tweaks, test cases, procedure changes).",
    "Never claim you already changed production config. All changes are proposals pending approval.",
    "",
    "TOOL RESULTS:",
    JSON.stringify(tools, null, 2),
  ].join("\n");

  const result = await llm.generate(
    [
      { role: "system", content: system },
      { role: "user", content: input.message },
    ],
    { temperature: 0.2, maxTokens: 900 },
  );

  const suggestions = extractSuggestions(input.message, result.text, tools);
  const saved: string[] = [];
  for (const s of suggestions) {
    const id = createId("bsug");
    await db
      .prepare(
        `INSERT INTO backstage_suggestions
        (id, workspace_id, agent_id, type, title, body, payload, status, created_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'proposed', ?, ?)`,
      )
      .bind(
        id,
        input.workspaceId,
        input.agentId || null,
        s.type,
        s.title,
        s.body,
        JSON.stringify(s.payload || {}),
        input.userId || null,
        nowIso(),
      )
      .run();
    saved.push(id);
  }

  return {
    content: result.text,
    model: result.model,
    tools,
    suggestionIds: saved,
  };
}

async function gatherBackstageContext(workspaceId: string, agentId?: string) {
  const db = await getDb();
  const results: BackstageToolResult[] = [];

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const convStats = await db
    .prepare(
      `SELECT COUNT(*) as total,
              SUM(CASE WHEN handoff_status IN ('escalated','human','on_hold') THEN 1 ELSE 0 END) as escalated,
              SUM(CASE WHEN resolution = 'AI_RESOLVED' THEN 1 ELSE 0 END) as ai_resolved
       FROM conversations WHERE workspace_id = ? AND created_at >= ?`,
    )
    .bind(workspaceId, since)
    .first();
  results.push({ name: "week_conversation_stats", data: convStats });

  const topics = await db
    .prepare(
      `SELECT COALESCE(topic,'General') as topic, COUNT(*) as c,
              SUM(CASE WHEN sentiment IN ('negative','frustrated') THEN 1 ELSE 0 END) as negative
       FROM conversations WHERE workspace_id = ? AND created_at >= ?
       GROUP BY topic ORDER BY c DESC LIMIT 10`,
    )
    .bind(workspaceId, since)
    .all();
  results.push({ name: "topics", data: topics.results || [] });

  const escReasons = await db
    .prepare(
      `SELECT reason, COUNT(*) as c FROM escalations WHERE workspace_id = ? AND created_at >= ?
       GROUP BY reason ORDER BY c DESC LIMIT 10`,
    )
    .bind(workspaceId, since)
    .all();
  results.push({ name: "escalation_reasons", data: escReasons.results || [] });

  const sentiment = await db
    .prepare(
      `SELECT COALESCE(sentiment,'neutral') as sentiment, COUNT(*) as c
       FROM conversations WHERE workspace_id = ? AND created_at >= ?
       GROUP BY sentiment`,
    )
    .bind(workspaceId, since)
    .all();
  results.push({ name: "sentiment", data: sentiment.results || [] });

  results.push({
    name: "knowledge_gaps",
    data: await listKnowledgeGaps(workspaceId, agentId, 10),
  });
  results.push({
    name: "top_questions",
    data: await listTopQuestions(workspaceId, agentId, 10),
  });

  if (agentId) {
    const agent = await db
      .prepare(`SELECT id, name, use_case, status, instructions FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(agentId, workspaceId)
      .first();
    results.push({ name: "agent", data: agent });
  }

  return results;
}

function extractSuggestions(
  userMessage: string,
  answer: string,
  tools: BackstageToolResult[],
): Array<{ type: string; title: string; body: string; payload?: Record<string, unknown> }> {
  const suggestions: Array<{ type: string; title: string; body: string; payload?: Record<string, unknown> }> = [];
  const gaps = (tools.find((t) => t.name === "knowledge_gaps")?.data || []) as Array<{
    question?: string;
    occurrence_count?: number;
  }>;

  if (/fix|improve|faq|knowledge|gap/i.test(userMessage) && gaps.length) {
    const top = gaps[0]!;
    const draftAnswer =
      answer
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l && !l.startsWith("I ") && l.length > 20)
        .slice(0, 4)
        .join(" ")
        .slice(0, 600) ||
      `We don't have a published answer for "${top.question || "this question"}" yet. Please confirm the official policy, then replace this draft.`;
    suggestions.push({
      type: "proposed_faq",
      title: `Add FAQ for: ${(top.question || "").slice(0, 80)}`,
      body: draftAnswer,
      payload: { question: top.question, answer: draftAnswer },
    });
  }

  if (/test|simulation|regression/i.test(userMessage)) {
    suggestions.push({
      type: "proposed_test_case",
      title: "Add regression case from top escalation",
      body: "Create a test case covering the most common escalation reason so publish gates catch regressions.",
      payload: { from: "escalation_reasons" },
    });
  }

  if (/instruction|tone|brand voice/i.test(userMessage)) {
    suggestions.push({
      type: "proposed_instruction",
      title: "Draft instruction tweak",
      body: answer.slice(0, 500),
      payload: { requires_approval: true },
    });
  }

  return suggestions.slice(0, 3);
}

export async function listBackstageSuggestions(workspaceId: string) {
  const db = await getDb();
  return (
    await db
      .prepare(
        `SELECT * FROM backstage_suggestions WHERE workspace_id = ? ORDER BY created_at DESC LIMIT 50`,
      )
      .bind(workspaceId)
      .all()
  ).results;
}

export async function applyBackstageSuggestion(input: {
  workspaceId: string;
  suggestionId: string;
  approve: boolean;
}) {
  const db = await getDb();
  const row = await db
    .prepare(`SELECT * FROM backstage_suggestions WHERE id = ? AND workspace_id = ?`)
    .bind(input.suggestionId, input.workspaceId)
    .first<{ id: string; status: string; type: string; agent_id: string | null; payload: string | null; body: string; title: string }>();

  if (!row) throw new Error("Suggestion not found");
  if (!input.approve) {
    await db
      .prepare(`UPDATE backstage_suggestions SET status = 'rejected' WHERE id = ?`)
      .bind(row.id)
      .run();
    return { status: "rejected" };
  }

  // Applying creates draft artifacts only — never silent production mutation beyond FAQ/test drafts
  if (row.type === "proposed_faq" && row.agent_id) {
    const payload = JSON.parse(row.payload || "{}") as { question?: string; answer?: string };
    const answer =
      (payload.answer && payload.answer.trim()) ||
      row.body.trim() ||
      "Draft answer approved from Backstage — review before publishing.";
    const sourceId = createId("src");
    await db
      .prepare(
        `INSERT INTO knowledge_sources
        (id, workspace_id, agent_id, name, type, status, content, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'qa', 'ready', ?, ?, ?)`,
      )
      .bind(
        sourceId,
        input.workspaceId,
        row.agent_id,
        row.title.slice(0, 120),
        JSON.stringify({
          q: payload.question || row.title,
          a: answer,
        }),
        nowIso(),
        nowIso(),
      )
      .run();
  }

  if (row.type === "proposed_instruction" && row.agent_id) {
    const agent = await db
      .prepare(`SELECT instructions FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(row.agent_id, input.workspaceId)
      .first<{ instructions: string | null }>();
    if (agent) {
      const addition = `\n\n# Backstage approved tweak\n${row.body.slice(0, 800)}`;
      await db
        .prepare(`UPDATE agents SET instructions = ?, updated_at = ? WHERE id = ?`)
        .bind(`${agent.instructions || ""}${addition}`.trim(), nowIso(), row.agent_id)
        .run();
    }
  }

  if (row.type === "proposed_test_case" && row.agent_id) {
    let suite = await db
      .prepare(`SELECT id FROM test_suites WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1`)
      .bind(row.agent_id)
      .first<{ id: string }>();
    if (!suite) {
      const suiteId = createId("suite");
      await db
        .prepare(`INSERT INTO test_suites (id, agent_id, name, created_at) VALUES (?, ?, ?, ?)`)
        .bind(suiteId, row.agent_id, "Backstage suggested", nowIso())
        .run();
      suite = { id: suiteId };
    }
    await db
      .prepare(
        `INSERT INTO test_cases
        (id, suite_id, name, user_input, expected_behavior, created_at)
        VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        createId("tc"),
        suite.id,
        row.title.slice(0, 80),
        "Regression scenario from Backstage",
        row.body.slice(0, 400),
        nowIso(),
      )
      .run();
  }

  await db
    .prepare(`UPDATE backstage_suggestions SET status = 'applied', applied_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id)
    .run();

  return { status: "applied" };
}
