import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createAgentRecord } from "@/lib/knowledge/ingestion";
import { buildInstructionTemplate, type AgentUseCase } from "@/lib/agent/templates";
import { getDb } from "@/lib/cloudflare";
import { nowIso } from "@/lib/utils";

export async function GET() {
  try {
    const { workspace } = await requireWorkspace();
    const db = await getDb();
    const agents = await db
      .prepare(`SELECT * FROM agents WHERE workspace_id = ? ORDER BY updated_at DESC`)
      .bind(workspace.id)
      .all();
    return NextResponse.json({ agents: agents.results || [] });
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
        name: z.string().min(2),
        useCase: z.string(),
        description: z.string().optional(),
        language: z.string().optional(),
        audience: z.string().optional(),
      })
      .parse(await req.json());

    const instructions = buildInstructionTemplate({
      agentName: body.name,
      organizationName: workspace.institution_name || workspace.name,
      useCase: body.useCase as AgentUseCase,
      audience: body.audience,
    });

    const agent = await createAgentRecord({
      workspaceId: workspace.id,
      name: body.name,
      useCase: body.useCase,
      description: body.description,
      language: body.language,
      audience: body.audience,
      instructions,
      organizationName: workspace.institution_name || workspace.name,
    });

    return NextResponse.json(agent);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Create failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = (await req.json()) as Record<string, unknown>;
    const id = String(body.id || "");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const db = await getDb();

    const fields: string[] = [];
    const values: unknown[] = [];
    const allowed = [
      "name",
      "description",
      "status",
      "instructions",
      "tone",
      "model_provider",
      "model_id",
      "fallback_model_id",
      "temperature",
      "max_tokens",
      "knowledge_mode",
      "show_citations",
      "guardrails",
      "branding",
      "brand_voice",
      "widget_config",
      "audience",
      "language",
      "avatar_url",
    ];

    for (const key of allowed) {
      if (body[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(
          typeof body[key] === "object" ? JSON.stringify(body[key]) : body[key],
        );
      }
    }
    fields.push(`updated_at = ?`);
    values.push(nowIso(), id, workspace.id);

    await db
      .prepare(
        `UPDATE agents SET ${fields.join(", ")} WHERE id = ? AND workspace_id = ?`,
      )
      .bind(...values)
      .run();

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Update failed" },
      { status: 400 },
    );
  }
}
