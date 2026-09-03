import { getDb } from "@/lib/cloudflare";
import { periodKey } from "@/lib/utils";

const PLAN_LIMITS: Record<string, { messages: number; agents: number }> = {
  free: { messages: 1000, agents: 1 },
  pro: { messages: 10000, agents: 5 },
  enterprise: { messages: 1_000_000, agents: 100 },
};

export async function getWorkspaceQuota(workspaceId: string) {
  const db = await getDb();
  const sub = await db
    .prepare(`SELECT plan, message_limit, status FROM subscriptions WHERE workspace_id = ?`)
    .bind(workspaceId)
    .first<{ plan: string; message_limit: number; status: string }>();
  const workspace = await db
    .prepare(`SELECT plan FROM workspaces WHERE id = ?`)
    .bind(workspaceId)
    .first<{ plan: string }>();

  const plan = (sub?.plan || workspace?.plan || "free").toLowerCase();
  const defaults = PLAN_LIMITS[plan] || PLAN_LIMITS.free!;
  const limit = sub?.message_limit || defaults.messages;

  const usage = await db
    .prepare(
      `SELECT quantity FROM usage_records WHERE workspace_id = ? AND metric = 'messages' AND period = ?`,
    )
    .bind(workspaceId, periodKey())
    .first<{ quantity: number }>();

  const used = usage?.quantity || 0;
  return {
    plan,
    status: sub?.status || "active",
    messageLimit: limit,
    messagesUsed: used,
    remaining: Math.max(0, limit - used),
    exceeded: used >= limit && plan !== "enterprise",
    agentLimit: defaults.agents,
  };
}

export async function assertWithinMessageQuota(workspaceId: string) {
  const quota = await getWorkspaceQuota(workspaceId);
  if (quota.exceeded) {
    throw new Error(
      `Message quota exceeded for ${quota.plan} plan (${quota.messagesUsed}/${quota.messageLimit}). Upgrade in Billing.`,
    );
  }
  return quota;
}

export async function setWorkspacePlan(workspaceId: string, plan: "free" | "pro" | "enterprise") {
  const db = await getDb();
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.free!;
  const existing = await db
    .prepare(`SELECT id FROM subscriptions WHERE workspace_id = ?`)
    .bind(workspaceId)
    .first<{ id: string }>();

  if (existing) {
    await db
      .prepare(
        `UPDATE subscriptions SET plan = ?, message_limit = ?, status = 'active' WHERE workspace_id = ?`,
      )
      .bind(plan, limits.messages, workspaceId)
      .run();
  } else {
    const { createId, nowIso } = await import("@/lib/utils");
    await db
      .prepare(
        `INSERT INTO subscriptions (id, workspace_id, plan, status, seats, message_limit, created_at)
         VALUES (?, ?, ?, 'active', 1, ?, ?)`,
      )
      .bind(createId("sub"), workspaceId, plan, limits.messages, nowIso())
      .run();
  }

  await db.prepare(`UPDATE workspaces SET plan = ? WHERE id = ?`).bind(plan, workspaceId).run();
  return { plan, messageLimit: limits.messages };
}
