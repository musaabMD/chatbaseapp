import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const body = z
      .object({
        agentId: z.string(),
        conversationId: z.string().optional(),
        name: z.string().optional(),
        email: z.string().email().optional(),
        phone: z.string().optional(),
        program: z.string().optional(),
        studyLevel: z.string().optional(),
        intake: z.string().optional(),
        country: z.string().optional(),
        consent: z.boolean().optional(),
      })
      .parse(await req.json());

    const db = await getDb();
    const agent = await db
      .prepare(`SELECT workspace_id FROM agents WHERE id = ?`)
      .bind(body.agentId)
      .first<{ workspace_id: string }>();
    if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });

    const contactId = createId("ct");
    await db
      .prepare(
        `INSERT INTO contacts
        (id, workspace_id, type, name, email, phone, country, program_interest, study_level, intake, last_seen_at, created_at, updated_at)
        VALUES (?, ?, 'lead', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        contactId,
        agent.workspace_id,
        body.name || null,
        body.email || null,
        body.phone || null,
        body.country || null,
        body.program || null,
        body.studyLevel || null,
        body.intake || null,
        nowIso(),
        nowIso(),
        nowIso(),
      )
      .run();

    const leadId = createId("lead");
    await db
      .prepare(
        `INSERT INTO leads
        (id, workspace_id, agent_id, contact_id, name, email, phone, program, study_level, intake, country, consent, status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`,
      )
      .bind(
        leadId,
        agent.workspace_id,
        body.agentId,
        contactId,
        body.name || null,
        body.email || null,
        body.phone || null,
        body.program || null,
        body.studyLevel || null,
        body.intake || null,
        body.country || null,
        body.consent ? 1 : 0,
        nowIso(),
      )
      .run();

    await db
      .prepare(
        `INSERT INTO analytics_events (id, workspace_id, agent_id, conversation_id, event_type, properties, created_at)
         VALUES (?, ?, ?, ?, 'lead.created', ?, ?)`,
      )
      .bind(
        createId("evt"),
        agent.workspace_id,
        body.agentId,
        body.conversationId || null,
        JSON.stringify({ program: body.program, intake: body.intake }),
        nowIso(),
      )
      .run();

    return NextResponse.json({ ok: true, leadId, contactId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Lead capture failed" },
      { status: 400 },
    );
  }
}
