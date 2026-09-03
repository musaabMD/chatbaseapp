import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

export async function POST(req: Request) {
  try {
    const body = z
      .object({
        messageId: z.string(),
        value: z.union([z.literal(1), z.literal(-1)]),
        reason: z.string().optional(),
      })
      .parse(await req.json());
    const db = await getDb();
    await db
      .prepare(`UPDATE messages SET feedback = ?, feedback_reason = ? WHERE id = ?`)
      .bind(body.value, body.reason || null, body.messageId)
      .run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Feedback failed" },
      { status: 400 },
    );
  }
}
