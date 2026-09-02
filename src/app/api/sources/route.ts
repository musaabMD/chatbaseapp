import { NextResponse } from "next/server";
import { z } from "zod";
import { requireWorkspace } from "@/lib/auth";
import { discoverWebsiteSource, trainWebsiteSource, createTextSource, createQaSource } from "@/lib/knowledge/ingestion";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { getEnv } from "@/lib/cloudflare";

export async function GET(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const agentId = new URL(req.url).searchParams.get("agentId");
    if (!agentId) return NextResponse.json({ error: "agentId required" }, { status: 400 });
    const db = await getDb();
    const sources = await db
      .prepare(
        `SELECT * FROM knowledge_sources WHERE workspace_id = ? AND agent_id = ? ORDER BY created_at DESC`,
      )
      .bind(workspace.id, agentId)
      .all();
    return NextResponse.json({ sources: sources.results || [] });
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
    const body = await req.json();
    const type = body.type as string;

    if (type === "website") {
      const parsed = z
        .object({
          agentId: z.string(),
          url: z.string().min(3),
          maxPages: z.number().optional(),
          includeRegex: z.string().optional(),
          train: z.boolean().optional(),
        })
        .parse(body);

      const discovered = await discoverWebsiteSource({
        workspaceId: workspace.id,
        agentId: parsed.agentId,
        url: parsed.url,
        maxPages: parsed.maxPages,
        includeRegex: parsed.includeRegex,
      });

      if (parsed.train !== false) {
        await trainWebsiteSource(discovered.sourceId);
      }

      // Prefer queue when available for async processing
      const env = await getEnv();
      if (env.INGESTION_QUEUE && parsed.train === false) {
        await env.INGESTION_QUEUE.send({
          type: "train_website",
          sourceId: discovered.sourceId,
        });
      }

      return NextResponse.json(discovered);
    }

    if (type === "text") {
      const parsed = z
        .object({ agentId: z.string(), title: z.string(), content: z.string().min(1) })
        .parse(body);
      const result = await createTextSource({
        workspaceId: workspace.id,
        agentId: parsed.agentId,
        title: parsed.title,
        content: parsed.content,
      });
      return NextResponse.json(result);
    }

    if (type === "qa") {
      const parsed = z
        .object({
          agentId: z.string(),
          name: z.string(),
          pairs: z.array(
            z.object({
              question: z.string(),
              answer: z.string(),
              alternates: z.array(z.string()).optional(),
            }),
          ),
        })
        .parse(body);
      const result = await createQaSource({
        workspaceId: workspace.id,
        agentId: parsed.agentId,
        name: parsed.name,
        pairs: parsed.pairs,
      });
      return NextResponse.json(result);
    }

    if (type === "file") {
      const parsed = z
        .object({
          agentId: z.string(),
          name: z.string(),
          contentType: z.string().optional(),
          text: z.string().min(1),
        })
        .parse(body);
      const db = await getDb();
      const env = await getEnv();
      const sourceId = createId("src");
      let r2Key: string | null = null;
      if (env.FILES) {
        r2Key = `uploads/${workspace.id}/${parsed.agentId}/${sourceId}.txt`;
        await env.FILES.put(r2Key, parsed.text, {
          httpMetadata: { contentType: parsed.contentType || "text/plain" },
        });
      }
      await db
        .prepare(
          `INSERT INTO knowledge_sources
          (id, workspace_id, agent_id, name, type, status, r2_key, content, characters, created_at, updated_at)
          VALUES (?, ?, ?, ?, 'file', 'embedding', ?, ?, ?, ?, ?)`,
        )
        .bind(
          sourceId,
          workspace.id,
          parsed.agentId,
          parsed.name,
          r2Key,
          parsed.text,
          parsed.text.length,
          nowIso(),
          nowIso(),
        )
        .run();
      const { indexTextContent } = await import("@/lib/rag/retrieve");
      await indexTextContent({
        workspaceId: workspace.id,
        agentId: parsed.agentId,
        sourceId,
        title: parsed.name,
        text: parsed.text,
      });
      return NextResponse.json({ sourceId });
    }

    if (type === "train") {
      const parsed = z.object({ sourceId: z.string() }).parse(body);
      const result = await trainWebsiteSource(parsed.sourceId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown source type" }, { status: 400 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Source failed" },
      { status: 400 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const { workspace } = await requireWorkspace();
    const sourceId = new URL(req.url).searchParams.get("id");
    if (!sourceId) return NextResponse.json({ error: "id required" }, { status: 400 });
    const db = await getDb();
    await db
      .prepare(`DELETE FROM knowledge_sources WHERE id = ? AND workspace_id = ?`)
      .bind(sourceId, workspace.id)
      .run();
    await db.prepare(`DELETE FROM knowledge_chunks WHERE source_id = ?`).bind(sourceId).run();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Delete failed" },
      { status: 400 },
    );
  }
}
