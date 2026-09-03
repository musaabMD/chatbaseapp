import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";

export type ProcedureStep = {
  type?: "instruction" | "condition" | "tool_call" | "collect_input" | "confirmation" | "branch" | "escalation" | "response";
  instruction: string;
  tool?: string;
  condition?: string;
};

export type ProcedureRow = {
  id: string;
  name: string;
  description: string | null;
  trigger_text: string | null;
  steps: string;
  enabled: number;
};

export function matchProcedure(procedures: ProcedureRow[], message: string): ProcedureRow | null {
  const m = message.toLowerCase();
  for (const proc of procedures) {
    if (!proc.enabled) continue;
    const triggers = (proc.trigger_text || proc.name || "")
      .split("|")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
    if (triggers.some((t) => m.includes(t) || new RegExp(t, "i").test(message))) {
      return proc;
    }
  }
  return null;
}

export function formatProcedureForPrompt(proc: ProcedureRow, currentStep = 0) {
  const steps = safeJsonParse<ProcedureStep[]>(proc.steps, []);
  const lines = steps.map((s, i) => {
    const marker = i === currentStep ? "→" : i < currentStep ? "✓" : "·";
    return `${marker} Step ${i + 1} [${s.type || "instruction"}]: ${s.instruction}`;
  });
  return `Procedure: ${proc.name}\n${proc.description || ""}\nFollow steps in order:\n${lines.join("\n")}`;
}

export async function getOrStartProcedureRun(input: {
  workspaceId: string;
  agentId: string;
  conversationId: string;
  message: string;
}) {
  const db = await getDb();

  const active = await db
    .prepare(
      `SELECT * FROM procedure_runs WHERE conversation_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`,
    )
    .bind(input.conversationId)
    .first<{
      id: string;
      procedure_id: string;
      current_step: number;
      state: string | null;
    }>();

  if (active) {
    const proc = await db
      .prepare(`SELECT * FROM procedures WHERE id = ?`)
      .bind(active.procedure_id)
      .first<ProcedureRow>();
    if (proc) {
      return {
        runId: active.id,
        procedure: proc,
        currentStep: active.current_step,
        prompt: formatProcedureForPrompt(proc, active.current_step),
        shouldEscalate: shouldEscalateFromStep(proc, active.current_step, input.message),
      };
    }
  }

  const procs = await db
    .prepare(`SELECT * FROM procedures WHERE agent_id = ? AND enabled = 1`)
    .bind(input.agentId)
    .all<ProcedureRow>();

  const matched = matchProcedure(procs.results || [], input.message);
  if (!matched) return null;

  const runId = createId("prun");
  await db
    .prepare(
      `INSERT INTO procedure_runs
      (id, workspace_id, agent_id, procedure_id, conversation_id, status, current_step, state, started_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'active', 0, ?, ?, ?)`,
    )
    .bind(
      runId,
      input.workspaceId,
      input.agentId,
      matched.id,
      input.conversationId,
      JSON.stringify({ lastMessage: input.message }),
      nowIso(),
      nowIso(),
    )
    .run();

  await db
    .prepare(`UPDATE conversations SET procedure_run_id = ?, updated_at = ? WHERE id = ?`)
    .bind(runId, nowIso(), input.conversationId)
    .run();

  return {
    runId,
    procedure: matched,
    currentStep: 0,
    prompt: formatProcedureForPrompt(matched, 0),
    shouldEscalate: shouldEscalateFromStep(matched, 0, input.message),
  };
}

export async function advanceProcedureRun(runId: string, nextStep: number, done = false) {
  const db = await getDb();
  if (done) {
    await db
      .prepare(
        `UPDATE procedure_runs SET status = 'completed', current_step = ?, completed_at = ?, updated_at = ? WHERE id = ?`,
      )
      .bind(nextStep, nowIso(), nowIso(), runId)
      .run();
    return;
  }
  await db
    .prepare(`UPDATE procedure_runs SET current_step = ?, updated_at = ? WHERE id = ?`)
    .bind(nextStep, nowIso(), runId)
    .run();
}

function shouldEscalateFromStep(proc: ProcedureRow, stepIndex: number, message: string) {
  const steps = safeJsonParse<ProcedureStep[]>(proc.steps, []);
  const step = steps[stepIndex];
  if (step?.type === "escalation") return true;
  if (/\b(human|agent|manager|supervisor)\b/i.test(message)) return true;
  return false;
}
