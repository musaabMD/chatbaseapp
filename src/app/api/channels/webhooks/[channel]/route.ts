import { NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";
import { normalizeIncoming, renderForChannel } from "@/lib/agent/channels";
import { runAgentTurn } from "@/lib/agent/runtime";

/**
 * Channel webhooks with lightweight signature / verify-token checks.
 * Provider SDKs (Twilio/Meta/Slack) plug into the same normalize → runtime path.
 */
export async function GET(req: Request, ctx: { params: Promise<{ channel: string }> }) {
  const { channel } = await ctx.params;
  const url = new URL(req.url);

  // Meta WhatsApp / Instagram / Messenger challenge
  if (["whatsapp", "instagram", "messenger"].includes(channel)) {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && challenge) {
      const db = await getDb();
      const hook = await db
        .prepare(`SELECT id FROM channel_webhooks WHERE channel = ? AND verify_token = ? AND status = 'active'`)
        .bind(channel, token)
        .first();
      if (hook) return new NextResponse(challenge, { status: 200 });
      return NextResponse.json({ error: "Invalid verify token" }, { status: 403 });
    }
  }

  return NextResponse.json({
    ok: true,
    channel,
    message: "POST inbound events to this endpoint",
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ channel: string }> }) {
  const { channel } = await ctx.params;
  try {
    const rawBody = await req.text();
    const signature =
      req.headers.get("x-hub-signature-256") ||
      req.headers.get("x-slack-signature") ||
      req.headers.get("x-twilio-signature") ||
      "";

    const db = await getDb();
    const payload = safeJsonParse<Record<string, unknown>>(rawBody, {});

    const agentId =
      String(payload.agentId || payload.agent_id || req.headers.get("x-campusly-agent-id") || "") ||
      "";
    if (agentId) {
      const hook = await db
        .prepare(`SELECT signing_secret FROM channel_webhooks WHERE agent_id = ? AND channel = ?`)
        .bind(agentId, channel)
        .first<{ signing_secret: string | null }>();
      if (hook?.signing_secret && !signature) {
        return NextResponse.json({ error: "Missing signature" }, { status: 401 });
      }
    }

    const workspaceId = String(payload.workspaceId || payload.workspace_id || "");
    const resolvedAgentId = agentId || String(payload.agent_id || "");
    if (!workspaceId || !resolvedAgentId) {
      await db
        .prepare(
          `INSERT INTO channel_events
          (id, workspace_id, agent_id, conversation_id, channel, direction, payload, status, created_at)
          VALUES (?, 'unknown', NULL, NULL, ?, 'inbound', ?, 'unmapped', ?)`,
        )
        .bind(createId("cevt"), channel, rawBody.slice(0, 8000), nowIso())
        .run();
      return NextResponse.json({
        ok: true,
        queued: true,
        note: "Event stored; include workspaceId + agentId for live replies",
      });
    }

    const normalized = normalizeIncoming(channel, {
      ...payload,
      text: payload.text || payload.body || (payload.message as { text?: string } | undefined)?.text,
    });

    const turn = await runAgentTurn({
      workspaceId,
      agentId: resolvedAgentId,
      message: normalized.text || "(empty)",
      conversationId: normalized.conversationId,
      channel,
      verifiedIdentity: normalized.verifiedIdentity || null,
      language: payload.language ? String(payload.language) : undefined,
    });

    const rendered = renderForChannel(channel, turn.content || "", turn.parts || []);

    await db
      .prepare(
        `INSERT INTO channel_events
        (id, workspace_id, agent_id, conversation_id, channel, direction, payload, status, created_at)
        VALUES (?, ?, ?, ?, ?, 'inbound', ?, 'processed', ?)`,
      )
      .bind(
        createId("cevt"),
        workspaceId,
        resolvedAgentId,
        turn.conversationId,
        channel,
        JSON.stringify({ signaturePresent: Boolean(signature), text: normalized.text, rendered }),
        nowIso(),
      )
      .run();

    return NextResponse.json({
      ok: true,
      conversationId: turn.conversationId,
      reply: rendered,
      parts: turn.parts,
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Webhook failed" },
      { status: 400 },
    );
  }
}
