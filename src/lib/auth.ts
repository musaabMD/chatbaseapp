import bcrypt from "bcryptjs";
import { cookies } from "next/headers";
import { createId, nowIso, sha256 } from "@/lib/utils";
import { getDb, getEnv } from "@/lib/cloudflare";

const SESSION_COOKIE = "campusly_session";
const SESSION_DAYS = 30;

export type User = {
  id: string;
  email: string;
  name: string;
  email_verified: number;
  avatar_url: string | null;
  created_at: string;
};

export type Workspace = {
  id: string;
  name: string;
  slug: string;
  website: string | null;
  institution_name: string | null;
  logo_url: string | null;
  brand_colors: string | null;
  brand_description: string | null;
  team_size: string | null;
  use_case: string | null;
  plan: string;
};

export type SessionContext = {
  user: User;
  workspace: Workspace | null;
  role: string | null;
};

async function authSecret() {
  const env = await getEnv();
  return env.AUTH_SECRET || process.env.AUTH_SECRET || "campusly-dev-secret";
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSession(userId: string) {
  const db = await getDb();
  const sessionId = createId("sess");
  const rawToken = createId("tok") + createId();
  const tokenHash = await sha256(rawToken + (await authSecret()));
  const expires = new Date();
  expires.setDate(expires.getDate() + SESSION_DAYS);

  await db
    .prepare(
      `INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES (?, ?, ?, ?)`,
    )
    .bind(sessionId, userId, tokenHash, expires.toISOString())
    .run();

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, rawToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });

  return sessionId;
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    const tokenHash = await sha256(token + (await authSecret()));
    await db.prepare(`DELETE FROM sessions WHERE token_hash = ?`).bind(tokenHash).run();
  }
  cookieStore.delete(SESSION_COOKIE);
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const db = await getDb();
  const tokenHash = await sha256(token + (await authSecret()));
  const row = await db
    .prepare(
      `SELECT u.* FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
    )
    .bind(tokenHash, nowIso())
    .first<User>();

  return row ?? null;
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new Error("Not authenticated");
  return user;
}

export async function getPrimaryWorkspace(userId: string) {
  const db = await getDb();
  return db
    .prepare(
      `SELECT w.*, m.role as member_role
       FROM workspace_members m
       JOIN workspaces w ON w.id = m.workspace_id
       WHERE m.user_id = ?
       ORDER BY m.created_at ASC
       LIMIT 1`,
    )
    .bind(userId)
    .first<Workspace & { member_role: string }>();
}

export async function getSessionContext(): Promise<SessionContext | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  const workspace = await getPrimaryWorkspace(user.id);
  return {
    user,
    workspace: workspace
      ? {
          id: workspace.id,
          name: workspace.name,
          slug: workspace.slug,
          website: workspace.website,
          institution_name: workspace.institution_name,
          logo_url: workspace.logo_url,
          brand_colors: workspace.brand_colors,
          brand_description: workspace.brand_description,
          team_size: workspace.team_size,
          use_case: workspace.use_case,
          plan: workspace.plan,
        }
      : null,
    role: workspace?.member_role ?? null,
  };
}

export async function requireWorkspace() {
  const ctx = await getSessionContext();
  if (!ctx?.user) throw new Error("Not authenticated");
  if (!ctx.workspace) throw new Error("Workspace required");
  return { user: ctx.user, workspace: ctx.workspace, role: ctx.role! };
}
