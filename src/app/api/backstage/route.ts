import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import {
  applyBackstageSuggestion,
  listBackstageSuggestions,
  runBackstageTurn,
} from "@/lib/agent/backstage";

export async function GET() {
  try {
    const { workspace } = await requireWorkspace();
    const suggestions = await listBackstageSuggestions(workspace.id);
    return NextResponse.json({ suggestions });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed" },
      { status: 400 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const { workspace, user } = await requireWorkspace();
    const body = z
      .object({
        action: z.enum(["ask", "apply", "reject"]).default("ask"),
        message: z.string().optional(),
        agentId: z.string().optional(),
        suggestionId: z.string().optional(),
      })
      .parse(await req.json());

    if (body.action === "ask") {
      if (!body.message?.trim()) {
        return NextResponse.json({ error: "message required" }, { status: 400 });
      }
      const result = await runBackstageTurn({
        workspaceId: workspace.id,
        agentId: body.agentId,
        message: body.message,
        userId: user.id,
      });
      return NextResponse.json(result);
    }

    if (!body.suggestionId) {
      return NextResponse.json({ error: "suggestionId required" }, { status: 400 });
    }

    const result = await applyBackstageSuggestion({
      workspaceId: workspace.id,
      suggestionId: body.suggestionId,
      approve: body.action === "apply",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Backstage failed" },
      { status: 400 },
    );
  }
}
