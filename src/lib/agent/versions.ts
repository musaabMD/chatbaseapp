import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { runAgentTurn } from "@/lib/agent/runtime";

export type AgentSnapshot = {
  instructions: string | null;
  brand_voice?: string | null;
  model_provider: string;
  model_id: string;
  fallback_model_id: string | null;
  temperature: number;
  max_tokens: number;
  knowledge_mode: string;
  show_citations: number;
  guardrails: string | null;
  branding: string | null;
  widget_config: string | null;
  use_case: string;
};

export async function publishAgentVersion(input: {
  agentId: string;
  label?: string;
  createdBy?: string;
  requirePassingTests?: boolean;
}) {
  const db = await getDb();
  const agent = await db
    .prepare(`SELECT * FROM agents WHERE id = ?`)
    .bind(input.agentId)
    .first<AgentSnapshot & { id: string; workspace_id: string; published_version_id: string | null }>();

  if (!agent) throw new Error("Agent not found");

  let gate: { passed: number; failed: number; total: number; blocked: boolean; notes: string } | null =
    null;

  if (input.requirePassingTests !== false) {
    gate = await runPublishRegressionGate({
      workspaceId: agent.workspace_id,
      agentId: input.agentId,
    });
    if (gate.blocked) {
      throw new Error(
        `Publish blocked: ${gate.failed}/${gate.total} test(s) failed. Fix regressions or publish with requirePassingTests=false.`,
      );
    }
  }

  const latest = await db
    .prepare(`SELECT MAX(version) as v FROM agent_versions WHERE agent_id = ?`)
    .bind(input.agentId)
    .first<{ v: number | null }>();

  const version = (latest?.v || 0) + 1;
  const id = createId("aver");
  const snapshot: AgentSnapshot = {
    instructions: agent.instructions,
    brand_voice: agent.brand_voice,
    model_provider: agent.model_provider,
    model_id: agent.model_id,
    fallback_model_id: agent.fallback_model_id,
    temperature: agent.temperature,
    max_tokens: agent.max_tokens,
    knowledge_mode: agent.knowledge_mode,
    show_citations: agent.show_citations,
    guardrails: agent.guardrails,
    branding: agent.branding,
    widget_config: agent.widget_config,
    use_case: agent.use_case,
  };

  await db
    .prepare(
      `INSERT INTO agent_versions (id, agent_id, version, label, status, snapshot, created_by, created_at)
       VALUES (?, ?, ?, ?, 'published', ?, ?, ?)`,
    )
    .bind(
      id,
      input.agentId,
      version,
      input.label || `v${version}`,
      JSON.stringify(snapshot),
      input.createdBy || null,
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `UPDATE agents SET published_version_id = ?, status = 'active', updated_at = ? WHERE id = ?`,
    )
    .bind(id, nowIso(), input.agentId)
    .run();

  return { id, version, gate };
}

async function runPublishRegressionGate(input: { workspaceId: string; agentId: string }) {
  const db = await getDb();
  const suite = await db
    .prepare(`SELECT id FROM test_suites WHERE agent_id = ? ORDER BY created_at DESC LIMIT 1`)
    .bind(input.agentId)
    .first<{ id: string }>();

  if (!suite) {
    const gateId = createId("pgate");
    await db
      .prepare(
        `INSERT INTO publish_gates (id, agent_id, suite_id, passed, failed, total, blocked, notes, created_at)
         VALUES (?, ?, NULL, 0, 0, 0, 0, 'No test suite — publish allowed with warning', ?)`,
      )
      .bind(gateId, input.agentId, nowIso())
      .run();
    return { passed: 0, failed: 0, total: 0, blocked: false, notes: "No test suite" };
  }

  const cases = await db
    .prepare(`SELECT * FROM test_cases WHERE suite_id = ?`)
    .bind(suite.id)
    .all<{
      id: string;
      user_input: string;
      expected_escalation: number;
      expected_action: string | null;
    }>();

  let passed = 0;
  let failed = 0;
  const notes: string[] = [];

  for (const tc of cases.results || []) {
    const turn = await runAgentTurn({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      message: tc.user_input,
      channel: "playground",
      debug: true,
    });
    const escalated = Boolean((turn as { escalated?: boolean }).escalated);
    let ok = true;
    if (tc.expected_escalation && !escalated) {
      ok = false;
      notes.push(`Expected escalation: ${tc.user_input.slice(0, 40)}`);
    }
    if (!tc.expected_escalation && escalated) {
      ok = false;
      notes.push(`Unexpected escalation: ${tc.user_input.slice(0, 40)}`);
    }
    if (ok) passed += 1;
    else failed += 1;
  }

  const total = passed + failed;
  const blocked = failed > 0;
  await db
    .prepare(
      `INSERT INTO publish_gates (id, agent_id, suite_id, passed, failed, total, blocked, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      createId("pgate"),
      input.agentId,
      suite.id,
      passed,
      failed,
      total,
      blocked ? 1 : 0,
      notes.join("; ").slice(0, 1000),
      nowIso(),
    )
    .run();

  return { passed, failed, total, blocked, notes: notes.join("; ") };
}
