import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, sha256 } from "@/lib/utils";

export type ApiKeyRow = {
  id: string;
  workspace_id: string;
  name: string;
  key_prefix: string;
  scopes: string | null;
  last_used_at: string | null;
  created_at: string;
};

function randomKeyMaterial() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function createApiKey(input: {
  workspaceId: string;
  name: string;
  scopes?: string[];
}) {
  const db = await getDb();
  const id = createId("apk");
  const raw = `cly_${randomKeyMaterial()}`;
  const keyPrefix = raw.slice(0, 10);
  const keyHash = await sha256(raw);
  const scopes = JSON.stringify(input.scopes || ["chat"]);

  await db
    .prepare(
      `INSERT INTO api_keys (id, workspace_id, name, key_prefix, key_hash, scopes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, input.workspaceId, input.name.slice(0, 80), keyPrefix, keyHash, scopes, nowIso())
    .run();

  return { id, name: input.name, keyPrefix, key: raw, scopes: input.scopes || ["chat"] };
}

export async function listApiKeys(workspaceId: string) {
  const db = await getDb();
  const rows = await db
    .prepare(
      `SELECT id, workspace_id, name, key_prefix, scopes, last_used_at, created_at
       FROM api_keys WHERE workspace_id = ? ORDER BY created_at DESC`,
    )
    .bind(workspaceId)
    .all<ApiKeyRow>();
  return rows.results || [];
}

export async function revokeApiKey(workspaceId: string, keyId: string) {
  const db = await getDb();
  const existing = await db
    .prepare(`SELECT id FROM api_keys WHERE id = ? AND workspace_id = ?`)
    .bind(keyId, workspaceId)
    .first();
  if (!existing) throw new Error("API key not found");
  await db.prepare(`DELETE FROM api_keys WHERE id = ?`).bind(keyId).run();
  return { ok: true };
}

export async function authenticateApiKey(rawKey: string) {
  if (!rawKey || !rawKey.startsWith("cly_")) return null;
  const db = await getDb();
  const keyHash = await sha256(rawKey);
  const row = await db
    .prepare(
      `SELECT id, workspace_id, name, key_prefix, scopes FROM api_keys WHERE key_hash = ?`,
    )
    .bind(keyHash)
    .first<{
      id: string;
      workspace_id: string;
      name: string;
      key_prefix: string;
      scopes: string | null;
    }>();
  if (!row) return null;

  await db
    .prepare(`UPDATE api_keys SET last_used_at = ? WHERE id = ?`)
    .bind(nowIso(), row.id)
    .run();

  return {
    keyId: row.id,
    workspaceId: row.workspace_id,
    name: row.name,
    scopes: (JSON.parse(row.scopes || '["chat"]') as string[]) || ["chat"],
  };
}

export function extractBearerToken(req: Request) {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}
