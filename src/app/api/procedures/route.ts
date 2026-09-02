import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

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
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const procedures = await db
      .prepare(`SELECT * FROM procedures WHERE agent_id = ? ORDER BY created_at DESC`)
      .bind(agentId)
      .all();

    return NextResponse.json({ procedures: procedures.results || [] });
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
        name: z.string().min(2),
        description: z.string().optional(),
        triggerText: z.string().optional(),
        steps: z.array(z.object({ instruction: z.string() })).min(1),
        requiredActions: z.array(z.string()).optional(),
        escalationPolicy: z.string().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(body.agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const id = createId("proc");

    await db
      .prepare(
        `INSERT INTO procedures
        (id, agent_id, name, description, trigger_text, steps, required_actions, escalation_policy, enabled, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 1, ?, ?)`,
      )
      .bind(
        id,
        body.agentId,
        body.name,
        body.description || null,
        body.triggerText || null,
        JSON.stringify(body.steps),
        JSON.stringify(body.requiredActions || []),
        body.escalationPolicy || null,
        nowIso(),
        nowIso(),
      )
      .run();

    return NextResponse.json({ id });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}
