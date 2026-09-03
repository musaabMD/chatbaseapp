import { NextResponse } from "next/server";
import { z } from "zod";
import { requireUser, requireWorkspace } from "@/lib/auth";
import { createContextProvider } from "@/lib/context/provider";
import { getDb } from "@/lib/cloudflare";
import { createId, normalizeDomain, nowIso, slugify } from "@/lib/utils";
import { buildInstructionTemplate, type EducationUseCase } from "@/lib/education/templates";
import { createAgentRecord } from "@/lib/knowledge/ingestion";

const schema = z.object({
  workspaceName: z.string().min(2),
  institutionName: z.string().min(2),
  website: z.string().optional(),
  teamSize: z.string().optional(),
  role: z.string().optional(),
  useCase: z.string(),
  agentName: z.string().min(2),
  audience: z.string().optional(),
  language: z.string().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const body = schema.parse(await req.json());
    const db = await getDb();

    let brand = null;
    if (body.website) {
      const provider = await createContextProvider();
      brand = await provider.getBrand(body.website);
    }

    const workspaceId = createId("ws");
    const slugBase = slugify(body.workspaceName) || createId("ws");
    await db
      .prepare(
        `INSERT INTO workspaces
        (id, name, slug, website, institution_name, logo_url, brand_colors, brand_description, team_size, use_case, plan, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'free', ?, ?)`,
      )
      .bind(
        workspaceId,
        body.workspaceName,
        `${slugBase}-${workspaceId.slice(-4)}`,
        body.website ? `https://${normalizeDomain(body.website)}` : null,
        body.institutionName || brand?.title || body.workspaceName,
        brand?.logos?.[0]?.url || null,
        JSON.stringify(brand?.colors || []),
        brand?.description || null,
        body.teamSize || null,
        body.useCase,
        nowIso(),
        nowIso(),
      )
      .run();

    await db
      .prepare(
        `INSERT INTO workspace_members (id, workspace_id, user_id, role, created_at)
         VALUES (?, ?, ?, 'owner', ?)`,
      )
      .bind(createId("mem"), workspaceId, user.id, nowIso())
      .run();

    await db
      .prepare(
        `INSERT INTO subscriptions (id, workspace_id, plan, status, seats, message_limit, created_at)
         VALUES (?, ?, 'free', 'active', 3, 2000, ?)`,
      )
      .bind(createId("sub"), workspaceId, nowIso())
      .run();

    const instructions = buildInstructionTemplate({
      agentName: body.agentName,
      institutionName: body.institutionName || brand?.title || body.workspaceName,
      useCase: body.useCase as EducationUseCase,
      audience: body.audience,
    });

    const agent = await createAgentRecord({
      workspaceId,
      name: body.agentName,
      useCase: body.useCase,
      audience: body.audience,
      language: body.language || "en",
      instructions,
      institutionName: body.institutionName,
      description: `${body.useCase} assistant for ${body.institutionName}`,
    });

    return NextResponse.json({
      ok: true,
      workspaceId,
      agentId: agent.id,
      brand,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Onboarding failed" },
      { status: 400 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = z
      .object({
        name: z.string().optional(),
        institutionName: z.string().optional(),
        website: z.string().optional(),
        brandDescription: z.string().optional(),
        brandColors: z.record(z.string(), z.string()).optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const fields: string[] = [];
    const values: unknown[] = [];

    if (body.name !== undefined) {
      fields.push("name = ?");
      values.push(body.name);
    }
    if (body.institutionName !== undefined) {
      fields.push("institution_name = ?");
      values.push(body.institutionName);
    }
    if (body.website !== undefined) {
      fields.push("website = ?");
      values.push(body.website || null);
    }
    if (body.brandDescription !== undefined) {
      fields.push("brand_description = ?");
      values.push(body.brandDescription || null);
    }
    if (body.brandColors !== undefined) {
      fields.push("brand_colors = ?");
      values.push(JSON.stringify(body.brandColors));
    }

    if (fields.length === 0) {
      return NextResponse.json({ ok: true });
    }

    fields.push("updated_at = ?");
    values.push(nowIso(), workspace.id);

    await db
      .prepare(`UPDATE workspaces SET ${fields.join(", ")} WHERE id = ?`)
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
