import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, normalizeDomain, nowIso } from "@/lib/utils";

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

    const domains = await db
      .prepare(`SELECT * FROM allowed_domains WHERE agent_id = ? ORDER BY created_at DESC`)
      .bind(agentId)
      .all();

    return NextResponse.json({ domains: domains.results || [] });
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
        domain: z.string().min(3),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(body.agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const domain = normalizeDomain(body.domain);
    const id = createId("dom");

    await db
      .prepare(`INSERT INTO allowed_domains (id, agent_id, domain, created_at) VALUES (?, ?, ?, ?)`)
      .bind(id, body.agentId, domain, nowIso())
      .run();

    return NextResponse.json({ id, domain });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const id = new URL(req.url).searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const db = await getDb();
    const row = await db
      .prepare(
        `SELECT d.id FROM allowed_domains d
         JOIN agents a ON a.id = d.agent_id
         WHERE d.id = ? AND a.workspace_id = ?`,
      )
      .bind(id, workspace.id)
      .first();

    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

    await db.prepare(`DELETE FROM allowed_domains WHERE id = ?`).bind(id).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 },
    );
  }
}
