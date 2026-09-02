import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, slugify } from "@/lib/utils";

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

    const actions = await db
      .prepare(`SELECT * FROM actions WHERE agent_id = ? ORDER BY created_at DESC`)
      .bind(agentId)
      .all();

    return NextResponse.json({ actions: actions.results || [] });
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
        slug: z.string().optional(),
        description: z.string().optional(),
        type: z.string().default("http"),
        config: z.record(z.string(), z.unknown()).optional(),
        inputSchema: z.record(z.string(), z.unknown()).optional(),
        requiresConfirmation: z.boolean().optional(),
        isSensitive: z.boolean().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(body.agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const id = createId("act");
    const slug = body.slug || slugify(body.name) || id.slice(-8);

    await db
      .prepare(
        `INSERT INTO actions
        (id, agent_id, name, slug, description, type, enabled, requires_confirmation, is_sensitive, config, input_schema, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        id,
        body.agentId,
        body.name,
        slug,
        body.description || null,
        body.type,
        body.requiresConfirmation ? 1 : 0,
        body.isSensitive ? 1 : 0,
        JSON.stringify(body.config || { url: "", method: "POST" }),
        JSON.stringify(body.inputSchema || {}),
        nowIso(),
        nowIso(),
      )
      .run();

    return NextResponse.json({ id, slug });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}
