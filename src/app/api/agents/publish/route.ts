import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { publishAgentVersion, rollbackAgentVersion } from "@/lib/agent/versions";
import { getDb } from "@/lib/cloudflare";

export async function POST(req: Request) {
  try {
    const { workspace, user } = await requireWorkspace();
    const body = z
      .object({
        agentId: z.string(),
        label: z.string().optional(),
        requirePassingTests: z.boolean().optional(),
        action: z.enum(["publish", "rollback"]).optional(),
        versionId: z.string().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(body.agentId, workspace.id)
      .first();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    if (body.action === "rollback") {
      if (!body.versionId) {
        return NextResponse.json({ error: "versionId required" }, { status: 400 });
      }
      const rolled = await rollbackAgentVersion({
        agentId: body.agentId,
        versionId: body.versionId,
      });
      return NextResponse.json(rolled);
    }

    const version = await publishAgentVersion({
      agentId: body.agentId,
      label: body.label,
      createdBy: user.id,
      requirePassingTests: body.requirePassingTests,
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
      .prepare(`SELECT id, published_version_id FROM agents WHERE id = ? AND workspace_id = ?`)
      .bind(agentId, workspace.id)
      .first<{ id: string; published_version_id: string | null }>();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const versions = await db
      .prepare(
        `SELECT id, version, label, status, created_by, created_at FROM agent_versions WHERE agent_id = ? ORDER BY version DESC`,
      )
      .bind(agentId)
      .all();

    const gates = await db
      .prepare(
        `SELECT id, suite_id, passed, failed, total, blocked, notes, created_at FROM publish_gates WHERE agent_id = ? ORDER BY created_at DESC LIMIT 10`,
      )
      .bind(agentId)
      .all();

    return NextResponse.json({
      versions: versions.results || [],
      gates: gates.results || [],
      publishedVersionId: agent.published_version_id,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
