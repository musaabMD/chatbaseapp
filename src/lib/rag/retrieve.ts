import { createLLMProvider } from "@/lib/llm/provider";
import { getEnv } from "@/lib/cloudflare";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso, safeJsonParse, sha256 } from "@/lib/utils";
import { chunkMarkdown } from "@/lib/rag/chunking";

export type RetrievedChunk = {
  id: string;
  text: string;
  title?: string | null;
  url?: string | null;
  heading?: string | null;
  sourceId: string;
  score: number;
};

export async function indexTextContent(input: {
  workspaceId: string;
  agentId: string;
  sourceId: string;
  title: string;
  text: string;
  url?: string;
  pageId?: string;
  metadata?: Record<string, unknown>;
}) {
  const db = await getDb();
  const env = await getEnv();
  const llm = await createLLMProvider();
  const chunks = chunkMarkdown(input.text);
  const embeddings = await llm.embed(chunks.map((c) => c.text));

  // Remove previous chunks for this source/page
  if (input.pageId) {
    const existing = await db
      .prepare(`SELECT id, vector_id FROM knowledge_chunks WHERE source_id = ? AND page_id = ?`)
      .bind(input.sourceId, input.pageId)
      .all<{ id: string; vector_id: string | null }>();
    await deleteChunkRows(existing.results || []);
  } else {
    const existing = await db
      .prepare(`SELECT id, vector_id FROM knowledge_chunks WHERE source_id = ?`)
      .bind(input.sourceId)
      .all<{ id: string; vector_id: string | null }>();
    await deleteChunkRows(existing.results || []);
  }

  const vectors: VectorizeVector[] = [];
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i]!;
    const chunkId = createId("chk");
    const contentHash = await sha256(chunk.text);
    await db
      .prepare(
        `INSERT INTO knowledge_chunks
        (id, workspace_id, agent_id, source_id, page_id, title, url, heading, text, content_hash, token_estimate, metadata, vector_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        chunkId,
        input.workspaceId,
        input.agentId,
        input.sourceId,
        input.pageId || null,
        input.title,
        input.url || null,
        chunk.heading || null,
        chunk.text,
        contentHash,
        Math.ceil(chunk.text.length / 4),
        JSON.stringify(input.metadata || {}),
        chunkId,
        nowIso(),
        nowIso(),
      )
      .run();

    vectors.push({
      id: chunkId,
      values: embeddings[i] || [],
      metadata: {
        workspaceId: input.workspaceId,
        agentId: input.agentId,
        sourceId: input.sourceId,
        documentId: input.pageId || input.sourceId,
        chunkId,
        title: input.title,
        url: input.url || "",
        heading: chunk.heading || "",
        text: chunk.text.slice(0, 500),
      },
    });
  }

  if (env.VECTORIZE && vectors.length) {
    await env.VECTORIZE.upsert(vectors);
  } else if (env.KV) {
    // Dev fallback: store embeddings in KV for retrieval
    for (let i = 0; i < vectors.length; i++) {
      const v = vectors[i]!;
      await env.KV.put(
        `vec:${input.workspaceId}:${input.agentId}:${v.id}`,
        JSON.stringify({ values: v.values, metadata: v.metadata }),
      );
    }
    const indexKey = `vecindex:${input.workspaceId}:${input.agentId}`;
    const existing = safeJsonParse<string[]>(await env.KV.get(indexKey), []);
    const next = Array.from(new Set([...existing, ...vectors.map((v) => v.id)]));
    await env.KV.put(indexKey, JSON.stringify(next));
  }

  await db
    .prepare(
      `UPDATE knowledge_sources SET chunk_count = (
         SELECT COUNT(*) FROM knowledge_chunks WHERE source_id = ?
       ), characters = ?, last_trained_at = ?, status = 'ready', updated_at = ? WHERE id = ?`,
    )
    .bind(input.sourceId, input.text.length, nowIso(), nowIso(), input.sourceId)
    .run();

  return { chunkCount: chunks.length };
}

async function deleteChunkRows(rows: Array<{ id: string; vector_id: string | null }>) {
  if (!rows.length) return;
  const db = await getDb();
  const env = await getEnv();
  for (const row of rows) {
    await db.prepare(`DELETE FROM knowledge_chunks WHERE id = ?`).bind(row.id).run();
  }
  if (env.VECTORIZE) {
    await env.VECTORIZE.deleteByIds(rows.map((r) => r.vector_id || r.id));
  }
}

export async function retrieveChunks(input: {
  workspaceId: string;
  agentId: string;
  query: string;
  topK?: number;
}): Promise<RetrievedChunk[]> {
  const topK = input.topK ?? 6;
  const llm = await createLLMProvider();
  const env = await getEnv();
  const [queryEmbedding] = await llm.embed([input.query]);

  if (env.VECTORIZE && queryEmbedding) {
    const matches = await env.VECTORIZE.query(queryEmbedding, {
      topK,
      returnMetadata: "all",
      filter: {
        workspaceId: input.workspaceId,
        agentId: input.agentId,
      },
    });

    return (matches.matches || []).map((m) => {
      const meta = (m.metadata || {}) as Record<string, string>;
      return {
        id: m.id,
        text: meta.text || "",
        title: meta.title,
        url: meta.url,
        heading: meta.heading,
        sourceId: meta.sourceId,
        score: m.score ?? 0,
      };
    });
  }

  // Fallback: lexical + KV vector cosine
  const db = await getDb();
  const rows = await db
    .prepare(
      `SELECT id, text, title, url, heading, source_id FROM knowledge_chunks
       WHERE workspace_id = ? AND agent_id = ?
       ORDER BY updated_at DESC LIMIT 200`,
    )
    .bind(input.workspaceId, input.agentId)
    .all<{
      id: string;
      text: string;
      title: string | null;
      url: string | null;
      heading: string | null;
      source_id: string;
    }>();

  const scored = (rows.results || []).map((row) => ({
    id: row.id,
    text: row.text,
    title: row.title,
    url: row.url,
    heading: row.heading,
    sourceId: row.source_id,
    score: lexicalScore(input.query, row.text),
  }));

  return scored.sort((a, b) => b.score - a.score).slice(0, topK);
}

function lexicalScore(query: string, text: string) {
  const qTokens = new Set(query.toLowerCase().split(/\W+/).filter((t) => t.length > 2));
  const tTokens = text.toLowerCase().split(/\W+/);
  let hits = 0;
  for (const t of tTokens) if (qTokens.has(t)) hits++;
  return hits / Math.max(qTokens.size, 1);
}

export function buildGroundedContext(chunks: RetrievedChunk[]) {
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.title || "Source"}${c.heading ? ` — ${c.heading}` : ""}${c.url ? ` (${c.url})` : ""}\n${c.text}`,
    )
    .join("\n\n");
}
