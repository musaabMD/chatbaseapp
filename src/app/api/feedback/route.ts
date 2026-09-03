import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/cloudflare";
import { nowIso } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const body = z
      .object({
        messageId: z.string(),
        value: z.union([z.literal(1), z.literal(-1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
        reason: z.string().optional(),
        conversationId: z.string().optional(),
      })
      .parse(await req.json());
    const db = await getDb();
    await db
      .prepare(`UPDATE messages SET feedback = ?, feedback_reason = ? WHERE id = ?`)
      .bind(body.value, body.reason || null, body.messageId)
      .run();

    // Map thumbs / 1-5 into conversation CSAT when possible
    if (body.conversationId) {
      const csat = body.value === 1 || body.value === -1 ? (body.value === 1 ? 5 : 1) : body.value;
      await db
        .prepare(`UPDATE conversations SET csat = ?, updated_at = ? WHERE id = ?`)
        .bind(csat, nowIso(), body.conversationId)
        .run();
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback failed" },
      { status: 400 },
    );
  }
}
