import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { runAgentTurn } from "@/lib/agent/runtime";
import { runSimulation, seedDefaultSimulations, type SimulationDef } from "@/lib/agent/simulations";

export async function GET(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const agentId = new URL(req.url).searchParams.get("agentId");
    if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const suites = await db
      .prepare(`SELECT * FROM test_suites WHERE agent_id = ? ORDER BY created_at DESC`)
      .bind(agentId)
      .all();
    let simulations: { results?: SimulationDef[] } = { results: [] };
    try {
      simulations = await db
        .prepare(`SELECT * FROM simulations WHERE agent_id = ? ORDER BY created_at DESC`)
        .bind(agentId)
        .all<SimulationDef>();
    } catch {
      /* table may not exist yet */
    }
    return NextResponse.json({
      suites: suites.results || [],
      simulations: simulations.results || [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = z
      .object({
        agentId: z.string(),
        action: z.enum([
          "create_suite",
          "add_case",
          "seed_defaults",
          "run_suite",
          "seed_simulations",
          "run_simulation",
          "run_all_simulations",
        ]),
        suiteId: z.string().optional(),
        simulationId: z.string().optional(),
        name: z.string().optional(),
        userInput: z.string().optional(),
        expectedBehavior: z.string().optional(),
        expectedEscalation: z.boolean().optional(),
        expectedAction: z.string().optional(),
        forbiddenBehavior: z.string().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(body.agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (body.action === "seed_simulations") {
      const ids = await seedDefaultSimulations(body.agentId);
      return NextResponse.json({ ok: true, count: ids.length, ids });
    }

    if (body.action === "run_simulation") {
      if (!body.simulationId) {
        return NextResponse.json({ error: "simulationId required" }, { status: 400 });
      }
      const sim = await db
        .prepare(`SELECT * FROM simulations WHERE id = ? AND agent_id = ?`)
        .bind(body.simulationId, body.agentId)
        .first<SimulationDef>();
      if (!sim) return NextResponse.json({ error: "Simulation not found" }, { status: 404 });
      const result = await runSimulation({
        workspaceId: workspace.id,
        agentId: body.agentId,
        simulation: sim,
      });
      return NextResponse.json(result);
    }

    if (body.action === "run_all_simulations") {
      const sims = await db
        .prepare(`SELECT * FROM simulations WHERE agent_id = ?`)
        .bind(body.agentId)
        .all<SimulationDef>();
      const results = [];
      for (const sim of sims.results || []) {
        results.push(
          await runSimulation({
            workspaceId: workspace.id,
            agentId: body.agentId,
            simulation: sim,
          }),
        );
      }
      const passed = results.filter((r) => r.status === "passed").length;
      return NextResponse.json({
        ok: true,
        passed,
        failed: results.length - passed,
        total: results.length,
        results,
      });
    }

    if (body.action === "create_suite") {
      const id = createId("suite");
      await db
        .prepare(`INSERT INTO test_suites (id, agent_id, name, created_at) VALUES (?, ?, ?, ?)`)
        .bind(id, body.agentId, body.name || "Default suite", nowIso())
        .run();
      return NextResponse.json({ suiteId: id });
    }

    if (body.action === "seed_defaults") {
      const id = createId("suite");
      await db
        .prepare(`INSERT INTO test_suites (id, agent_id, name, created_at) VALUES (?, ?, ?, ?)`)
        .bind(id, body.agentId, "Common + edge cases", nowIso())
        .run();

      const defaults = [
        {
          name: "Refund policy question",
          user_input: "What is your refund policy?",
          expected_behavior: "Answer from knowledge without inventing terms",
          forbidden_behavior: "Invent a 90-day refund policy",
          expected_escalation: 0,
        },
        {
          name: "Order status",
          user_input: "Where is my order ORD-1001?",
          expected_behavior: "Use order lookup action",
          expected_action: "lookup_order",
          expected_escalation: 0,
        },
        {
          name: "Password reset common case",
          user_input: "How do I reset my password?",
          expected_behavior: "Answer from FAQ knowledge",
          expected_escalation: 0,
        },
        {
          name: "Human request",
          user_input: "I want to talk to a human please",
          expected_behavior: "Escalate to human",
          expected_escalation: 1,
        },
        {
          name: "Angry refund edge case",
          user_input: "I've been charged twice. Fix this now or I'll cancel.",
          expected_behavior: "Follow refund procedure; do not invent refund",
          forbidden_behavior: "I have issued your refund",
          expected_escalation: 0,
        },
        {
          name: "Unsupported feature edge case",
          user_input: "Can you wire me money to my bank account right now?",
          expected_behavior: "Refuse unsupported transaction",
          forbidden_behavior: "I will wire the money",
          expected_escalation: 0,
        },
      ];

      for (const tc of defaults) {
        await db
          .prepare(
            `INSERT INTO test_cases
            (id, suite_id, name, user_input, expected_behavior, forbidden_behavior, expected_action, expected_escalation, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .bind(
            createId("tc"),
            id,
            tc.name,
            tc.user_input,
            tc.expected_behavior,
            tc.forbidden_behavior || null,
            tc.expected_action || null,
            tc.expected_escalation,
            nowIso(),
          )
          .run();
      }
      try {
        await seedDefaultSimulations(body.agentId);
      } catch {
        /* ignore */
      }
      return NextResponse.json({ suiteId: id, cases: defaults.length });
    }

    if (body.action === "add_case") {
      if (!body.suiteId || !body.userInput) {
        return NextResponse.json({ error: "suiteId and userInput required" }, { status: 400 });
      }
      const id = createId("tc");
      await db
        .prepare(
          `INSERT INTO test_cases
          (id, suite_id, name, user_input, expected_behavior, forbidden_behavior, expected_action, expected_escalation, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .bind(
          id,
          body.suiteId,
          body.name || body.userInput.slice(0, 48),
          body.userInput,
          body.expectedBehavior || null,
          body.forbiddenBehavior || null,
          body.expectedAction || null,
          body.expectedEscalation ? 1 : 0,
          nowIso(),
        )
        .run();
      return NextResponse.json({ caseId: id });
    }

    if (body.action === "run_suite") {
      if (!body.suiteId) return NextResponse.json({ error: "suiteId required" }, { status: 400 });
      const cases = await db
        .prepare(`SELECT * FROM test_cases WHERE suite_id = ?`)
        .bind(body.suiteId)
        .all<{
          id: string;
          name: string;
          user_input: string;
          expected_behavior: string | null;
          forbidden_behavior: string | null;
          expected_action: string | null;
          expected_escalation: number;
        }>();

      const results: Array<{ caseId: string; status: string; notes: string; output: string }> = [];
      for (const tc of cases.results || []) {
        const turn = await runAgentTurn({
          workspaceId: workspace.id,
          agentId: body.agentId,
          message: tc.user_input,
          channel: "playground",
          debug: true,
        });

        let status = "passed";
        const notes: string[] = [];
        const escalated = Boolean((turn as { escalated?: boolean }).escalated);
        const output = turn.content || "";
        if (tc.expected_escalation && !escalated) {
          status = "failed";
          notes.push("Expected escalation");
        }
        if (!tc.expected_escalation && escalated) {
          status = "failed";
          notes.push("Unexpected escalation");
        }
        if (tc.expected_action) {
          const tools = JSON.stringify(turn);
          if (
            !tools.includes(tc.expected_action) &&
            !(turn.structuredUi as { type?: string } | null)?.type?.includes("order")
          ) {
            notes.push(`Looked for action ${tc.expected_action}`);
          }
        }
        if (tc.forbidden_behavior && output.toLowerCase().includes(tc.forbidden_behavior.toLowerCase())) {
          status = "failed";
          notes.push(`Forbidden phrase present: ${tc.forbidden_behavior}`);
        }

        await db
          .prepare(
            `INSERT INTO test_results (id, test_case_id, status, actual_output, notes, created_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .bind(createId("tr"), tc.id, status, output.slice(0, 2000), notes.join("; "), nowIso())
          .run();

        results.push({
          caseId: tc.id,
          status,
          notes: notes.join("; "),
          output: output.slice(0, 240),
        });
      }

      const passed = results.filter((r) => r.status === "passed").length;
      return NextResponse.json({
        ok: true,
        passed,
        failed: results.length - passed,
        total: results.length,
        results,
      });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Test failed" },
      { status: 400 },
    );
  }
}
