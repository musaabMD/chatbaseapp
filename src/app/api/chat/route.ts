import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/cloudflare";
import { runAgentTurn } from "@/lib/agent/runtime";
import { requireWorkspace } from "@/lib/auth";
import { authenticateApiKey, extractBearerToken } from "@/lib/auth/api-keys";

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
  identity: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  verifiedIdentity: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).optional(),
  language: z.string().optional(),
  confirmed: z.boolean().optional(),
  stream: z.boolean().optional(),
});

async function resolveWorkspace(req: Request, body: z.infer<typeof schema>) {
  const db = await getDb();
  const bearer = extractBearerToken(req);

  if (bearer) {
    const apiKey = await authenticateApiKey(bearer);
    if (!apiKey) throw new Error("Invalid API key");
    if (!apiKey.scopes.includes("chat") && !apiKey.scopes.includes("*")) {
      throw new Error("API key missing chat scope");
    }
    const agent = await db
      .prepare(`SELECT workspace_id, status FROM agents WHERE id = ?`)
      .bind(body.agentId)
      .first<{ workspace_id: string; status: string }>();
    if (!agent || agent.workspace_id !== apiKey.workspaceId) {
      throw new Error("Agent not found for this API key");
    }
    return { workspaceId: apiKey.workspaceId, channelDefault: "api" as const };
  }

  if (!body.public) {
    const session = await requireWorkspace();
    return { workspaceId: session.workspace.id, channelDefault: "playground" as const };
  }

  const agent = await db
    .prepare(`SELECT workspace_id, status FROM agents WHERE id = ?`)
    .bind(body.agentId)
    .first<{ workspace_id: string; status: string }>();
  if (!agent || agent.status !== "active") {
    throw new Error("Assistant unavailable");
  }
  const origin = req.headers.get("origin") || "";
  if (origin && !origin.includes("localhost")) {
    try {
      const host = new URL(origin).hostname.replace(/^www\./, "");
      const allowed = await db
        .prepare(`SELECT domain FROM allowed_domains WHERE agent_id = ?`)
        .bind(body.agentId)
        .all<{ domain: string }>();
      const list = allowed.results || [];
      if (
        list.length > 0 &&
        !list.some((d: { domain: string }) => host === d.domain || host.endsWith(`.${d.domain}`))
      ) {
        throw new Error("Origin not allowed");
      }
    } catch (e) {
      if (e instanceof Error && e.message === "Origin not allowed") throw e;
    }
  }
  return { workspaceId: agent.workspace_id, channelDefault: "widget" as const };
}

function sseEncode(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

export async function POST(req: Request) {
  try {
    const body = schema.parse(await req.json());
    const { workspaceId, channelDefault } = await resolveWorkspace(req, body);
    const verifiedIdentity = body.verifiedIdentity || body.identity || null;

    const run = async () =>
      runAgentTurn({
        workspaceId,
        agentId: body.agentId,
        message: body.message,
        conversationId: body.conversationId,
        debug: body.debug,
        pageUrl: body.pageUrl,
        pageTitle: body.pageTitle,
        channel: body.channel || channelDefault,
        verifiedIdentity,
        language: body.language,
        confirmed: body.confirmed,
      });

    if (body.stream) {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        async start(controller) {
          const send = (event: string, data: unknown) => {
            controller.enqueue(encoder.encode(sseEncode(event, data)));
          };
          try {
            send("status", { phase: "thinking" });
            const result = await run();
            const text = result.content || "";
            const chunkSize = 24;
            for (let i = 0; i < text.length; i += chunkSize) {
              send("token", { text: text.slice(i, i + chunkSize) });
            }
            send("done", result);
          } catch (error) {
            send("error", {
              error: error instanceof Error ? error.message : "Chat failed",
            });
          } finally {
            controller.close();
          }
        },
      });

      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        },
      });
    }

    const result = await run();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Chat failed" },
      { status: 400 },
    );
  }
}
