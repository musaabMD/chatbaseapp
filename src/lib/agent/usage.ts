import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, periodKey } from "@/lib/utils";

export async function recordUsage(workspaceId: string, metric: string, quantity = 1) {
  if (quantity <= 0) return;
  const db = await getDb();
  const period = periodKey();
  const existing = await db
    .prepare(`SELECT id, quantity FROM usage_records WHERE workspace_id = ? AND metric = ? AND period = ?`)
    .bind(workspaceId, metric, period)
    .first<{ id: string; quantity: number }>();

  if (existing) {
    await db
      .prepare(`UPDATE usage_records SET quantity = ? WHERE id = ?`)
      .bind(existing.quantity + quantity, existing.id)
      .run();
  } else {
    await db
      .prepare(
        `INSERT INTO usage_records (id, workspace_id, metric, quantity, period, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .bind(createId("usage"), workspaceId, metric, quantity, period, nowIso())
      .run();
  }
}
