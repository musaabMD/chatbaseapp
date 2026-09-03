import { createContextProvider } from "@/lib/context/provider";
import { getDb, getEnv } from "@/lib/cloudflare";
import { indexTextContent } from "@/lib/rag/retrieve";
import { createId, ensureUrl, nowIso, sha256, slugify } from "@/lib/utils";

export async function discoverWebsiteSource(input: {
  workspaceId: string;
  agentId: string;
  url: string;
  maxPages?: number;
  includeRegex?: string;
  name?: string;
}) {
  const db = await getDb();
  const provider = await createContextProvider();
  const sourceId = createId("src");
  const target = ensureUrl(input.url);

  await db
    .prepare(
      `INSERT INTO knowledge_sources
      (id, workspace_id, agent_id, name, type, status, config, url, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'website', 'crawling', ?, ?, ?, ?)`,
    )
    .bind(
      sourceId,
      input.workspaceId,
      input.agentId,
      input.name || new URL(target).hostname,
      JSON.stringify({
        maxPages: input.maxPages ?? 25,
        includeRegex: input.includeRegex || null,
      }),
      target,
      nowIso(),
      nowIso(),
    )
    .run();

  const pages = await provider.crawlWebsite({
    url: target,
    maxPages: input.maxPages ?? 25,
    urlRegex: input.includeRegex,
    useMainContentOnly: true,
  });

  for (const page of pages) {
    const pageId = createId("page");
    const hash = await sha256(page.markdown);
    await db
      .prepare(
        `INSERT INTO crawled_pages
        (id, source_id, url, title, description, content_hash, characters, selected, status, last_crawled_at, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'pending', ?, ?)`,
      )
      .bind(
        pageId,
        sourceId,
        page.url,
        page.title || page.url,
        page.markdown.slice(0, 180),
        hash,
        page.markdown.length,
        nowIso(),
        nowIso(),
      )
      .run();

    // Store raw markdown artifact in R2 when available
    const env = await getEnv();
    if (env.FILES) {
      const key = `sources/${input.workspaceId}/${sourceId}/${pageId}.md`;
      await env.FILES.put(key, page.markdown, {
        httpMetadata: { contentType: "text/markdown" },
      });
      await db.prepare(`UPDATE crawled_pages SET r2_key = ? WHERE id = ?`).bind(key, pageId).run();
    }
  }

  await db
    .prepare(
      `UPDATE knowledge_sources SET status = 'processing', page_count = ?, updated_at = ? WHERE id = ?`,
    )
    .bind(pages.length, nowIso(), sourceId)
    .run();

  return { sourceId, pages: pages.map((p) => ({ url: p.url, title: p.title })) };
}

export async function trainWebsiteSource(sourceId: string) {
  const db = await getDb();
  const source = await db
    .prepare(`SELECT * FROM knowledge_sources WHERE id = ?`)
    .bind(sourceId)
    .first<{
      id: string;
      workspace_id: string;
      agent_id: string;
      name: string;
      status: string;
    }>();
  if (!source) throw new Error("Source not found");

  await db
    .prepare(`UPDATE knowledge_sources SET status = 'embedding', updated_at = ? WHERE id = ?`)
    .bind(nowIso(), sourceId)
    .run();

  const pages = await db
    .prepare(`SELECT * FROM crawled_pages WHERE source_id = ? AND selected = 1`)
    .bind(sourceId)
    .all<{
      id: string;
      url: string;
      title: string | null;
      r2_key: string | null;
      content_hash: string | null;
    }>();

  const env = await getEnv();
  const provider = await createContextProvider();
  let totalChars = 0;

  for (const page of pages.results || []) {
    let markdown = "";
    if (page.r2_key && env.FILES) {
      const obj = await env.FILES.get(page.r2_key);
      markdown = obj ? await obj.text() : "";
    }
    if (!markdown) {
      markdown = (await provider.scrapeUrl(page.url)).markdown;
    }
    totalChars += markdown.length;
    await indexTextContent({
      workspaceId: source.workspace_id,
      agentId: source.agent_id,
      sourceId,
      pageId: page.id,
      title: page.title || page.url,
      url: page.url,
      text: markdown,
    });
    await db
      .prepare(`UPDATE crawled_pages SET status = 'ready', characters = ? WHERE id = ?`)
      .bind(markdown.length, page.id)
      .run();
  }

  await db
    .prepare(
      `UPDATE knowledge_sources
       SET status = 'ready', characters = ?, last_trained_at = ?, updated_at = ?
       WHERE id = ?`,
    )
    .bind(totalChars, nowIso(), nowIso(), sourceId)
    .run();

  await db
    .prepare(`UPDATE agents SET last_trained_at = ?, updated_at = ? WHERE id = ?`)
    .bind(nowIso(), nowIso(), source.agent_id)
    .run();

  return { ok: true, pages: (pages.results || []).length };
}

export async function createTextSource(input: {
  workspaceId: string;
  agentId: string;
  title: string;
  content: string;
}) {
  const db = await getDb();
  const sourceId = createId("src");
  await db
    .prepare(
      `INSERT INTO knowledge_sources
      (id, workspace_id, agent_id, name, type, status, content, characters, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'text', 'embedding', ?, ?, ?, ?)`,
    )
    .bind(
      sourceId,
      input.workspaceId,
      input.agentId,
      input.title,
      input.content,
      input.content.length,
      nowIso(),
      nowIso(),
    )
    .run();

  await indexTextContent({
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    sourceId,
    title: input.title,
    text: input.content,
  });

  return { sourceId };
}

export async function createQaSource(input: {
  workspaceId: string;
  agentId: string;
  name: string;
  pairs: Array<{ question: string; answer: string; alternates?: string[] }>;
}) {
  const db = await getDb();
  const sourceId = createId("src");
  await db
    .prepare(
      `INSERT INTO knowledge_sources
      (id, workspace_id, agent_id, name, type, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'qa', 'embedding', ?, ?)`,
    )
    .bind(sourceId, input.workspaceId, input.agentId, input.name, nowIso(), nowIso())
    .run();

  const parts: string[] = [];
  for (const pair of input.pairs) {
    const id = createId("qa");
    await db
      .prepare(
        `INSERT INTO qa_pairs (id, source_id, question, answer, alternates, priority, created_at)
         VALUES (?, ?, ?, ?, ?, 20, ?)`,
      )
      .bind(id, sourceId, pair.question, pair.answer, JSON.stringify(pair.alternates || []), nowIso())
      .run();
    parts.push(`Q: ${pair.question}\nA: ${pair.answer}`);
  }

  await indexTextContent({
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    sourceId,
    title: input.name,
    text: parts.join("\n\n"),
    metadata: { type: "qa", priority: 20 },
  });

  return { sourceId };
}

export async function createAgentRecord(input: {
  workspaceId: string;
  name: string;
  useCase: string;
  description?: string;
  language?: string;
  audience?: string;
  instructions?: string;
  institutionName?: string;
  organizationName?: string;
  status?: string;
  modelProvider?: string;
  modelId?: string;
}) {
  const db = await getDb();
  const id = createId("agent");
  const slug = slugify(input.name) || createId("a");
  const publicSlug = `${slug}-${id.slice(-6)}`;
  const { welcomeMessageFor } = await import("@/lib/agent/templates");
  const welcome = welcomeMessageFor(input.useCase, input.name);

  await db
    .prepare(
      `INSERT INTO agents
      (id, workspace_id, name, slug, public_slug, description, use_case, status, language, audience, instructions,
       model_provider, model_id, widget_config, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.workspaceId,
      input.name,
      slug,
      publicSlug,
      input.description || null,
      input.useCase,
      input.status || "draft",
      input.language || "en",
      input.audience || null,
      input.instructions || null,
      input.modelProvider || "openrouter",
      input.modelId || "openai/gpt-4o-mini",
      JSON.stringify({
        position: "bottom-right",
        primaryColor: "#0C5C4C",
        welcomeMessage: welcome,
        placeholder: "Ask a question...",
        starterQuestions: true,
        showSources: true,
        showFeedback: true,
        proactiveMessage: welcome,
        proactiveDelayMs: 4000,
      }),
      nowIso(),
      nowIso(),
    )
    .run();

  return { id, slug, publicSlug };
}
