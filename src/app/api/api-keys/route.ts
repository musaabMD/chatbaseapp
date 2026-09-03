import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { createApiKey, listApiKeys, revokeApiKey } from "@/lib/auth/api-keys";

export async function GET() {
  try {
    const { workspace } = await requireWorkspace();
    const keys = await listApiKeys(workspace.id);
    return NextResponse.json({ keys });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = z
      .object({
        name: z.string().min(1).max(80),
        scopes: z.array(z.string()).optional(),
      })
      .parse(await req.json());

    const created = await createApiKey({
      workspaceId: workspace.id,
      name: body.name,
      scopes: body.scopes,
    });
    return NextResponse.json(created);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = z.object({ keyId: z.string() }).parse(await req.json());
    await revokeApiKey(workspace.id, body.keyId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
