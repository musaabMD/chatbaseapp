import { getDb } from "@/lib/cloudflare";
import { createLLMProvider } from "@/lib/llm/provider";
import { buildGroundedContext, retrieveChunks } from "@/lib/rag/retrieve";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";
import { STARTER_QUESTIONS, type EducationUseCase } from "@/lib/education/templates";

export type ChatCitation = {
  title: string;
  url?: string | null;
  snippet: string;
  sourceType?: string;
};

export type StructuredUi =
  | { type: "buttons"; items: Array<{ label: string; action: string; value?: string }> }
  | { type: "lead_form"; fields: string[]; title: string }
  | { type: "course_cards"; items: Array<{ title: string; subtitle?: string; href?: string }> }
  | { type: "cta"; label: string; href: string };

export async function runAgentTurn(input: {
  workspaceId: string;
  agentId: string;
  conversationId?: string;
  message: string;
  contactId?: string;
  pageUrl?: string;
  pageTitle?: string;
  channel?: string;
  debug?: boolean;
}) {
  const db = await getDb();
  const agent = await db
    .prepare(`SELECT * FROM agents WHERE id = ? AND workspace_id = ?`)
    .bind(input.agentId, input.workspaceId)
    .first<{
      id: string;
      name: string;
      instructions: string | null;
      model_id: string;
      temperature: number;
      max_tokens: number;
      knowledge_mode: string;
      show_citations: number;
      use_case: string;
      institution_name?: string;
    }>();

  if (!agent) throw new Error("Agent not found");

  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = createId("conv");
    await db
      .prepare(
        `INSERT INTO conversations
        (id, workspace_id, agent_id, contact_id, channel, status, handoff_status, page_url, page_title, message_count, last_message_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'open', 'ai', ?, ?, 0, ?, ?, ?)`,
      )
      .bind(
        conversationId,
        input.workspaceId,
        input.agentId,
        input.contactId || null,
        input.channel || "playground",
        input.pageUrl || null,
        input.pageTitle || null,
        nowIso(),
        nowIso(),
        nowIso(),
      )
      .run();
  }

  const userMessageId = createId("msg");
  await db
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
    )
    .bind(userMessageId, conversationId, input.message, nowIso())
    .run();

  const started = Date.now();
  const chunks = await retrieveChunks({
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    query: input.message,
    topK: 6,
  });

  const grounded = buildGroundedContext(chunks);
  const pageContext =
    input.pageUrl || input.pageTitle
      ? `Current page: ${input.pageTitle || ""} ${input.pageUrl || ""}`.trim()
      : "";

  const knowledgePolicy =
    agent.knowledge_mode === "strict"
      ? "Strict knowledge mode: answer institutional facts only from provided sources. If missing, say you cannot confirm."
      : agent.knowledge_mode === "general"
        ? "General knowledge is allowed for explanations, but institutional facts must come from sources."
        : "Balanced mode: prefer sources for institutional facts; you may use general education knowledge for explanations.";

  const system = `${agent.instructions || "You are a helpful education assistant."}

${knowledgePolicy}

${pageContext}

Retrieved institutional knowledge:
${grounded || "(no knowledge retrieved)"}

When useful, suggest next steps such as applying, booking advising, or capturing contact details.
Return plain Markdown. Do not invent sources.`;

  const history = await db
    .prepare(
      `SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY created_at DESC LIMIT 12`,
    )
    .bind(conversationId)
    .all<{ role: string; content: string }>();

  const llm = await createLLMProvider();
  const orderedHistory = (history.results || []).reverse();
  const result = await llm.generate(
    [
      { role: "system", content: system },
      ...orderedHistory.map((m: { role: string; content: string }) => ({
        role: m.role as "user" | "assistant" | "system",
        content: m.content,
      })),
    ],
    {
      model: agent.model_id,
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
    },
  );

  const citations: ChatCitation[] = agent.show_citations
    ? chunks.slice(0, 3).map((c) => ({
        title: c.title || c.heading || "Source",
        url: c.url,
        snippet: c.text.slice(0, 240),
      }))
    : [];

  const structuredUi = inferStructuredUi(input.message, agent.use_case as EducationUseCase);
  const confidence = chunks.length ? Math.min(0.95, 0.45 + chunks[0]!.score * 0.2) : 0.25;
  const assistantMessageId = createId("msg");
  const latency = Date.now() - started;

  await db
    .prepare(
      `INSERT INTO messages
      (id, conversation_id, role, content, citations, retrieval_trace, structured_ui, model_id, latency_ms, confidence, created_at)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      assistantMessageId,
      conversationId,
      result.text,
      JSON.stringify(citations),
      JSON.stringify(
        input.debug
          ? chunks.map((c) => ({ id: c.id, score: c.score, title: c.title, url: c.url }))
          : { count: chunks.length },
      ),
      JSON.stringify(structuredUi),
      result.model,
      latency,
      confidence,
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `UPDATE conversations
       SET message_count = message_count + 2,
           last_message_at = ?,
           updated_at = ?,
           topic = COALESCE(topic, ?),
           sentiment = COALESCE(sentiment, 'neutral')
       WHERE id = ?`,
    )
    .bind(nowIso(), nowIso(), classifyTopic(input.message), conversationId)
    .run();

  await db
    .prepare(
      `INSERT INTO analytics_events (id, workspace_id, agent_id, conversation_id, event_type, properties, created_at)
       VALUES (?, ?, ?, ?, 'message.assistant', ?, ?)`,
    )
    .bind(
      createId("evt"),
      input.workspaceId,
      input.agentId,
      conversationId,
      JSON.stringify({ latency_ms: latency, confidence, model: result.model }),
      nowIso(),
    )
    .run();

  return {
    conversationId,
    messageId: assistantMessageId,
    content: result.text,
    citations,
    structuredUi,
    confidence,
    latencyMs: latency,
    model: result.model,
    retrieval: chunks,
    starterQuestions: STARTER_QUESTIONS[(agent.use_case as EducationUseCase) || "custom"],
  };
}

function classifyTopic(message: string) {
  const m = message.toLowerCase();
  if (/(tuition|fee|cost|price)/.test(m)) return "Tuition";
  if (/(scholarship|financial aid|aid)/.test(m)) return "Financial Aid";
  if (/(deadline|apply|admission|gpa)/.test(m)) return "Admissions";
  if (/(visa|ielts|international)/.test(m)) return "International Students";
  if (/(course|program|prerequisite)/.test(m)) return "Programs";
  if (/(housing|dorm|campus)/.test(m)) return "Campus Life";
  if (/(lms|password|login|portal)/.test(m)) return "Technical Support";
  return "General";
}

function inferStructuredUi(message: string, useCase: EducationUseCase): StructuredUi | null {
  const m = message.toLowerCase();
  if (/(apply|application|enroll)/.test(m)) {
    return {
      type: "buttons",
      items: [
        { label: "Start application", action: "start_application" },
        { label: "Talk to admissions", action: "handoff" },
      ],
    };
  }
  if (/(brochure|contact me|interested|counselor|advisor)/.test(m)) {
    return {
      type: "lead_form",
      title: "Share your details",
      fields: ["name", "email", "program", "intake"],
    };
  }
  if (/(course|program).*(show|list|recommend)|show me .*course/.test(m) || useCase === "course_advisor") {
    if (/(course|program)/.test(m)) {
      return {
        type: "course_cards",
        items: [
          { title: "Computer Science", subtitle: "4 years · Next intake September" },
          { title: "Data Science Certificate", subtitle: "8 months · Online + evening" },
        ],
      };
    }
  }
  return null;
}

export async function getAgentPublicConfig(publicSlug: string) {
  const db = await getDb();
  const agent = await db
    .prepare(
      `SELECT a.*, w.institution_name, w.logo_url as workspace_logo
       FROM agents a
       JOIN workspaces w ON w.id = a.workspace_id
       WHERE a.public_slug = ? AND a.status = 'active'`,
    )
    .bind(publicSlug)
    .first();
  if (!agent) return null;
  return {
    ...agent,
    widget_config: safeJsonParse(agent.widget_config as string | null, {}),
    branding: safeJsonParse(agent.branding as string | null, {}),
  };
}
