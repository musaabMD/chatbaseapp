import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { setWorkspacePlan } from "@/lib/billing/quota";

export async function POST(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const body = z
      .object({
        plan: z.enum(["free", "pro", "enterprise"]),
      })
      .parse(await req.json());

    // Local / demo plan switch — live Stripe Checkout replaces this when credentials exist
    const result = await setWorkspacePlan(workspace.id, body.plan);
    return NextResponse.json({
      ok: true,
      ...result,
      note: "Local plan switch (no Stripe). Wire Checkout for production billing.",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}
