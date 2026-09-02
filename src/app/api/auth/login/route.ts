import { NextResponse } from "next/server";
import { z } from "zod";
import { createSession, verifyPassword } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const db = await getDb();
    const user = await db
      .prepare(`SELECT id, password_hash FROM users WHERE email = ?`)
      .bind(body.email.toLowerCase())
      .first<{ id: string; password_hash: string }>();

    if (!user?.password_hash || !(await verifyPassword(body.password, user.password_hash))) {
      return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
    }

    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Login failed" },
      { status: 400 },
    );
  }
}
