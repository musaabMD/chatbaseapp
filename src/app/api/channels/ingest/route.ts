import { NextResponse } from "next/server";
import { z } from "zod";
import { runAgentTurn } from "@/lib/agent/runtime";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { normalizeIncoming, recordChannelEvent, renderForChannel } from "@/lib/agent/channels";

const schema = z.object({
  agentId: z.string(),
  channel: z.enum([
    "email",
    "whatsapp",
    "messenger",
    "instagram",
    "slack",
    "voice",
    "in_app",
    "api",
  ]),
  text: z.string().min(1).optional(),
  body: z.string().optional(),
  message: z.string().optional(),
  conversationId: z.string().optional(),
  customerId: z.string().optional(),
  identity: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  verifiedIdentity: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Omnichannel ingress: normalize → agent runtime → channel-specific render.
 * Real provider webhooks (Twilio/Meta/Slack) should POST here after signature verification.
 */
export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const db = await getDb();

    const agent = await db
      .prepare(`SELECT id, workspace_id, status FROM agents WHERE id = ?`)
      .bind(body.agentId)
      .first<{ id: string; workspace_id: string; status: string }>();

    if (!agent || agent.status !== "active") {
      // Allow playground-style testing for draft agents when authenticated
      if (!agent) return NextResponse.json({ error: "Agent not found" }, { status: 404 });
      try {
        await requireWorkspace();
      } catch {
        return NextResponse.json({ error: "Assistant unavailable" }, { status: 404 });
      }
    }

    const event = normalizeIncoming(body.channel, {
      ...body,
      text: body.text || body.body || body.message || "",
      verifiedIdentity: body.verifiedIdentity || body.identity,
    });

    if (!event.text.trim()) {
      return NextResponse.json({ error: "text required" }, { status: 400 });
    }

    await recordChannelEvent({
      workspaceId: agent.workspace_id,
      agentId: agent.id,
      conversationId: event.conversationId,
      channel: body.channel,
      direction: "inbound",
      payload: event,
    });

    const result = await runAgentTurn({
      workspaceId: agent.workspace_id,
      agentId: agent.id,
      message: event.text,
      conversationId: event.conversationId,
      channel: body.channel,
      verifiedIdentity: event.verifiedIdentity || null,
      debug: false,
    });

    const rendered = renderForChannel(body.channel, result.content, result.parts);

    await recordChannelEvent({
      workspaceId: agent.workspace_id,
      agentId: agent.id,
      conversationId: result.conversationId,
      channel: body.channel,
      direction: "outbound",
      payload: rendered,
      status: "sent_stub",
    });

    return NextResponse.json({
      ...result,
      channel: body.channel,
      rendered,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Channel ingest failed" },
      { status: 400 },
    );
  }
}
