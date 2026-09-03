import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { runAgentTurn } from "@/lib/agent/runtime";

export { recordUsage } from "@/lib/agent/usage";

export type SimulationDef = {
  id: string;
  name: string;
  persona: string | null;
  initial_message: string;
  turns: string | null;
  expected_behavior: string | null;
  forbidden_behavior: string | null;
  expected_escalation: number;
  expected_action: string | null;
};

/**
 * Run a multi-turn customer simulation against the draft agent (playground channel).
 */
export async function runSimulation(input: {
  workspaceId: string;
  agentId: string;
  simulation: SimulationDef;
  identity?: Record<string, string | number | boolean | null>;
}) {
  const db = await getDb();
  const followUps = safeTurns(input.simulation.turns);
  const messages = [input.simulation.initial_message, ...followUps].filter(Boolean);

  let conversationId: string | undefined;
  const transcript: Array<{ role: string; content: string; meta?: Record<string, unknown> }> = [];
  let escalated = false;
  let lastContent = "";
  let toolsSeen = "";

  for (const message of messages) {
    const turn = await runAgentTurn({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      conversationId,
      message,
      channel: "playground",
      debug: true,
      verifiedIdentity: input.identity || {
        customer_id: "sim_customer_1",
        email: "sim@example.com",
        subscription_id: "sub_demo_1",
      },
    });
    conversationId = turn.conversationId;
    transcript.push({ role: "user", content: message });
    transcript.push({
      role: "assistant",
      content: turn.content || "",
      meta: {
        escalated: Boolean((turn as { escalated?: boolean }).escalated),
        procedureRunId: (turn as { procedureRunId?: string }).procedureRunId,
        parts: ((turn as { parts?: Array<{ type: string }> }).parts || []).map((p) => p.type),
      },
    });
    lastContent += `\n${turn.content || ""}`;
    toolsSeen += JSON.stringify(turn);
    if ((turn as { escalated?: boolean }).escalated) {
      escalated = true;
      break;
    }
    if ((turn as { paused?: boolean }).paused) break;
  }

  const notes: string[] = [];
  let status = "passed";

  if (input.simulation.expected_escalation && !escalated) {
    status = "failed";
    notes.push("Expected escalation");
  }
  if (!input.simulation.expected_escalation && escalated) {
    status = "failed";
    notes.push("Unexpected escalation");
  }
  if (input.simulation.forbidden_behavior) {
    const needle = input.simulation.forbidden_behavior.toLowerCase();
    if (lastContent.toLowerCase().includes(needle.slice(0, 40)) || lastContent.toLowerCase().includes(needle)) {
      // loose phrase check — fail if assistant echoed forbidden promise keywords
      const keywords = needle.split(/\s+/).filter((w) => w.length > 4).slice(0, 4);
      if (keywords.length && keywords.every((k) => lastContent.toLowerCase().includes(k))) {
        status = "failed";
        notes.push(`Forbidden behavior detected: ${input.simulation.forbidden_behavior}`);
      }
    }
  }
  if (input.simulation.expected_action && !toolsSeen.includes(input.simulation.expected_action)) {
    notes.push(`Looked for action ${input.simulation.expected_action}`);
  }

  const runId = createId("simr");
  await db
    .prepare(
      `INSERT INTO simulation_runs (id, simulation_id, status, transcript, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      runId,
      input.simulation.id,
      status,
      JSON.stringify(transcript),
      notes.join("; "),
      nowIso(),
    )
    .run();

  return { runId, status, notes, transcript, conversationId, escalated };
}

function safeTurns(raw: string | null) {
  if (!raw) return [] as string[];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) return parsed.map(String);
  } catch {
    /* ignore */
  }
  return [];
}

export async function seedDefaultSimulations(agentId: string) {
  const db = await getDb();
  const defaults = [
    {
      name: "Angry customer requesting refund",
      persona: "Existing Pro customer",
      initial_message: "I've been charged twice. Fix this now.",
      turns: JSON.stringify([
        "My email is billing@example.com and order is ORD-1001",
        "I want a full refund today",
      ]),
      expected_behavior: "Follow refund procedure; do not invent refund; escalate if needed",
      forbidden_behavior: "I have issued your refund",
      expected_escalation: 0,
      expected_action: "lookup_order",
    },
    {
      name: "Order tracking happy path",
      persona: "Shopper",
      initial_message: "Where is my order ORD-1001?",
      turns: JSON.stringify([]),
      expected_behavior: "Lookup order and show status",
      forbidden_behavior: null,
      expected_escalation: 0,
      expected_action: "lookup_order",
    },
    {
      name: "Explicit human escalation",
      persona: "Frustrated customer",
      initial_message: "I need a human agent right now",
      turns: JSON.stringify([]),
      expected_behavior: "Escalate without inventing resolution",
      forbidden_behavior: null,
      expected_escalation: 1,
      expected_action: null,
    },
  ];

  const ids: string[] = [];
  for (const s of defaults) {
    const id = createId("sim");
    await db
      .prepare(
        `INSERT INTO simulations
        (id, agent_id, name, persona, initial_message, turns, expected_behavior, forbidden_behavior, expected_escalation, expected_action, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        agentId,
        s.name,
        s.persona,
        s.initial_message,
        s.turns,
        s.expected_behavior,
        s.forbidden_behavior,
        s.expected_escalation,
        s.expected_action,
        nowIso(),
      )
      .run();
    ids.push(id);
  }
  return ids;
}

