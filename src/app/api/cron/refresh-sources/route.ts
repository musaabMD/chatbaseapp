import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getDb } from "@/lib/cloudflare";
import { trainWebsiteSource } from "@/lib/knowledge/ingestion";
import { nowIso } from "@/lib/utils";

/**
 * Cloudflare Cron Trigger entry via scheduled Workers invocation.
 * OpenNext forwards scheduled events when configured; this route also
 * supports manual ops calls with CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = await getDb();
  const due = await db
    .prepare(
      `SELECT id, auto_refresh, last_trained_at FROM knowledge_sources
       WHERE type = 'website' AND auto_refresh IN ('daily', 'weekly', 'monthly') AND status = 'ready'`,
    )
    .all<{ id: string; auto_refresh: string; last_trained_at: string | null }>();

  const now = Date.now();
  const refreshed: string[] = [];
  for (const source of due.results || []) {
    const last = source.last_trained_at ? Date.parse(source.last_trained_at) : 0;
    const interval =
      source.auto_refresh === "daily"
        ? 24 * 60 * 60 * 1000
        : source.auto_refresh === "weekly"
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
    if (now - last >= interval) {
      try {
        await trainWebsiteSource(source.id);
        refreshed.push(source.id);
      } catch (error) {
        await db
          .prepare(`UPDATE knowledge_sources SET status = 'failed', last_error = ?, updated_at = ? WHERE id = ?`)
          .bind(error instanceof Error ? error.message : "refresh failed", nowIso(), source.id)
          .run();
      }
    }
  }

  return NextResponse.json({ ok: true, refreshed });
}
