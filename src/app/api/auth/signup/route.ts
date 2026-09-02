import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, hashPassword } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

const schema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(8),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const db = await getDb();
    const existing = await db
      .prepare(`SELECT id FROM users WHERE email = ?`)
      .bind(body.email.toLowerCase())
      .first();
    if (existing) {
      return NextResponse.json({ error: "Email already registered" }, { status: 400 });
    }

    const userId = createId("user");
    const passwordHash = await hashPassword(body.password);
    await db
      .prepare(
        `INSERT INTO users (id, email, name, password_hash, email_verified, created_at, updated_at)
         VALUES (?, ?, ?, ?, 0, ?, ?)`,
      )
      .bind(userId, body.email.toLowerCase(), body.name, passwordHash, nowIso(), nowIso())
      .run();

    await createSession(userId);
    return NextResponse.json({ ok: true, userId });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Signup failed" },
      { status: 400 },
    );
  }
}
