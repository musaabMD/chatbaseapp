import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/cloudflare";
import { runAgentTurn } from "@/lib/agent/runtime";
import { requireWorkspace } from "@/lib/auth";

const schema = z.object({
  agentId: z.string(),
  message: z.string().min(1),
  conversationId: z.string().optional(),
  debug: z.boolean().optional(),
  pageUrl: z.string().optional(),
  pageTitle: z.string().optional(),
  channel: z.string().optional(),
  workspaceId: z.string().optional(),
  public: z.boolean().optional(),
});

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const db = await getDb();

    let workspaceId = body.workspaceId;
    if (!body.public) {
      const session = await requireWorkspace();
      workspaceId = session.workspace.id;
    } else {
      const agent = await db
        .prepare(`SELECT workspace_id, status FROM agents WHERE id = ?`)
        .bind(body.agentId)
        .first<{ workspace_id: string; status: string }>();
      if (!agent || agent.status !== "active") {
        return NextResponse.json({ error: "Assistant unavailable" }, { status: 404 });
      }
      // Domain allowlist check for widget
      const origin = req.headers.get("origin") || "";
      if (origin && !origin.includes("localhost")) {
        try {
          const host = new URL(origin).hostname.replace(/^www\./, "");
          const allowed = await db
            .prepare(`SELECT domain FROM allowed_domains WHERE agent_id = ?`)
            .bind(body.agentId)
            .all<{ domain: string }>();
          const list = allowed.results || [];
          if (list.length > 0 && !list.some((d) => host === d.domain || host.endsWith(`.${d.domain}`))) {
            return NextResponse.json({ error: "Origin not allowed" }, { status: 403 });
          }
        } catch {
          /* ignore invalid origin */
        }
      }
      workspaceId = agent.workspace_id;
    }

    const result = await runAgentTurn({
      workspaceId: workspaceId!,
      agentId: body.agentId,
      message: body.message,
      conversationId: body.conversationId,
      debug: body.debug,
      pageUrl: body.pageUrl,
      pageTitle: body.pageTitle,
      channel: body.channel || (body.public ? "widget" : "playground"),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 400 },
    );
  }
}
