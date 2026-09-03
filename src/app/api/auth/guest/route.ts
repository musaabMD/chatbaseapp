import { NextResponse } from "next/server";
import { startGuestDemo } from "@/lib/auth/guest";

export async function POST() {
  try {
    const result = await startGuestDemo();
    return NextResponse.json({
      ok: true,
      ...result,
      redirectTo: result.agentId
        ? `/dashboard/agents/${result.agentId}/playground`
        : "/dashboard",
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Guest demo failed" },
      { status: 500 },
    );
  }
}
