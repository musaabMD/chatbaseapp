import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { publishAgentVersion } from "@/lib/agent/versions";
import { getDb } from "@/lib/cloudflare";

export async function POST(req: Request) {
  try {
    const { workspace, user } = await requireWorkspace();
    const body = z
      .object({
        agentId: z.string(),
        label: z.string().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(body.agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const version = await publishAgentVersion({
      agentId: body.agentId,
      label: body.label,
      createdBy: user.id,
    });

    return NextResponse.json(version);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Publish failed" },
      { status: 400 },
    );
  }
}

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

    const versions = await db
      .prepare(
        `SELECT id, version, label, status, created_by, created_at FROM agent_versions WHERE agent_id = ? ORDER BY version DESC`,
      )
      .bind(agentId)
      .all();

    return NextResponse.json({ versions: versions.results || [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
