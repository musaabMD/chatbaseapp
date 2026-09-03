import { getDb } from "@/lib/cloudflare";
import { createLLMProvider } from "@/lib/llm/provider";
import { buildGroundedContext, retrieveChunks } from "@/lib/rag/retrieve";
import { createId, nowIso, safeJsonParse } from "@/lib/utils";
import { STARTER_QUESTIONS } from "@/lib/agent/templates";
import { parseGuardrails, evaluateGuardrails } from "@/lib/agent/guardrails";
import { composeSystemPrompt } from "@/lib/agent/prompt";
import { getOrStartProcedureRun, advanceProcedureRun } from "@/lib/agent/procedures";
import {
  actionsToPrompt,
  detectActionIntent,
  executeAction,
  listAgentActions,
  type VerifiedIdentity,
} from "@/lib/agent/actions";
import {
  textToParts,
  type MessagePart,
  type AgentMessagePayload,
} from "@/lib/agent/message-parts";
import { escalateConversation } from "@/lib/agent/escalation";
import { saveAgentTrace } from "@/lib/agent/traces";
import { classifyTopic, classifySentiment, detectLanguage } from "@/lib/agent/classify";
import { recordConversationSignals } from "@/lib/agent/knowledge-gaps";

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
  | { type: "cta"; label: string; href: string }
  | { type: "order_status"; orderId: string; status: string; eta?: string; trackingUrl?: string };

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
  verifiedIdentity?: VerifiedIdentity | null;
  language?: string;
}) {
  const db = await getDb();
  const agent = await db
    .prepare(`SELECT a.*, w.institution_name, w.name as workspace_name
      FROM agents a
      JOIN workspaces w ON w.id = a.workspace_id
      WHERE a.id = ? AND a.workspace_id = ?`)
    .bind(input.agentId, input.workspaceId)
    .first<{
      id: string;
      name: string;
      instructions: string | null;
      model_id: string;
      model_provider: string;
      fallback_model_id: string | null;
      temperature: number;
      max_tokens: number;
      knowledge_mode: string;
      show_citations: number;
      use_case: string;
      guardrails: string | null;
      brand_voice: string | null;
      published_version_id: string | null;
      institution_name?: string;
      workspace_name?: string;
    }>();

  if (!agent) throw new Error("Agent not found");

  // Production channels use the published snapshot; playground/tests use live draft config
  const productionChannels = new Set([
    "widget",
    "hosted",
    "email",
    "whatsapp",
    "messenger",
    "instagram",
    "slack",
    "voice",
    "in_app",
    "api",
  ]);
  const usePublished = productionChannels.has(input.channel || "") && Boolean(agent.published_version_id);
  if (usePublished && agent.published_version_id) {
    const version = await db
      .prepare(`SELECT snapshot FROM agent_versions WHERE id = ?`)
      .bind(agent.published_version_id)
      .first<{ snapshot: string }>();
    const snap = safeJsonParse<{
      instructions?: string | null;
      brand_voice?: string | null;
      model_id?: string;
      model_provider?: string;
      fallback_model_id?: string | null;
      temperature?: number;
      max_tokens?: number;
      knowledge_mode?: string;
      show_citations?: number;
      guardrails?: string | null;
      use_case?: string;
    }>(version?.snapshot, {});
    if (snap.instructions !== undefined) agent.instructions = snap.instructions ?? agent.instructions;
    if (snap.brand_voice !== undefined) agent.brand_voice = snap.brand_voice ?? agent.brand_voice;
    if (snap.model_id) agent.model_id = snap.model_id;
    if (snap.model_provider) agent.model_provider = snap.model_provider;
    if (snap.fallback_model_id !== undefined) agent.fallback_model_id = snap.fallback_model_id ?? null;
    if (snap.temperature != null) agent.temperature = snap.temperature;
    if (snap.max_tokens != null) agent.max_tokens = snap.max_tokens;
    if (snap.knowledge_mode) agent.knowledge_mode = snap.knowledge_mode;
    if (snap.show_citations != null) agent.show_citations = snap.show_citations;
    if (snap.guardrails !== undefined) agent.guardrails = snap.guardrails ?? null;
    if (snap.use_case) agent.use_case = snap.use_case;
  }

  const rules = parseGuardrails(agent.guardrails);
  const preModel = evaluateGuardrails({
    rules,
    scope: "pre_model",
    message: input.message,
  });

  let conversationId = input.conversationId;
  if (!conversationId) {
    conversationId = createId("conv");
    await db
      .prepare(
        `INSERT INTO conversations
        (id, workspace_id, agent_id, contact_id, channel, status, handoff_status, page_url, page_title,
         message_count, last_message_at, verified_identity, language, agent_version_id, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'open', 'ai', ?, ?, 0, ?, ?, ?, ?, ?, ?)`,
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
        input.verifiedIdentity ? JSON.stringify(input.verifiedIdentity) : null,
        input.language || null,
        agent.published_version_id || null,
        nowIso(),
        nowIso(),
      )
      .run();
  } else if (input.verifiedIdentity) {
    await db
      .prepare(`UPDATE conversations SET verified_identity = ?, updated_at = ? WHERE id = ?`)
      .bind(JSON.stringify(input.verifiedIdentity), nowIso(), conversationId)
      .run();
  }

  const userMessageId = createId("msg");
  await db
    .prepare(
      `INSERT INTO messages (id, conversation_id, role, content, created_at) VALUES (?, ?, 'user', ?, ?)`,
    )
    .bind(userMessageId, conversationId, input.message, nowIso())
    .run();

  // If a human already owns this thread (or on hold), do not run the AI — same conversation continues
  const convState = await db
    .prepare(`SELECT automation_state, handoff_status FROM conversations WHERE id = ?`)
    .bind(conversationId)
    .first<{ automation_state: string | null; handoff_status: string }>();
  const pausedStates = new Set(["human", "on_hold", "escalating"]);
  const pausedHandoffs = new Set(["human", "on_hold"]);
  if (
    pausedStates.has(convState?.automation_state || "") ||
    pausedHandoffs.has(convState?.handoff_status || "")
  ) {
    await db
      .prepare(`UPDATE conversations SET message_count = message_count + 1, last_message_at = ?, updated_at = ? WHERE id = ?`)
      .bind(nowIso(), nowIso(), conversationId)
      .run();
    return {
      conversationId,
      messageId: userMessageId,
      content: "",
      parts: [],
      citations: [] as ChatCitation[],
      structuredUi: null,
      confidence: 1,
      latencyMs: 0,
      model: "human",
      paused: true,
      automationState: convState?.automation_state || convState?.handoff_status,
      starterQuestions: STARTER_QUESTIONS[agent.use_case] || STARTER_QUESTIONS.custom,
    };
  }

  // Immediate escalation path (human request / blocked)
  if (preModel.escalate || !preModel.allow) {
    return finalizeEscalation({
      conversationId,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      message: preModel.message || "Connecting you with a human teammate.",
      reason: preModel.escalate ? "human_request" : "guardrail_block",
      started: Date.now(),
      useCase: agent.use_case,
      triggerMessageId: userMessageId,
      customerMessage: input.message,
      guardrailDecisions: preModel,
    });
  }

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

  let procedurePrompt: string | null = null;
  let procedureRunId: string | null = null;
  try {
    const proc = await getOrStartProcedureRun({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      conversationId,
      message: input.message,
    });
    if (proc) {
      procedurePrompt = proc.prompt;
      procedureRunId = proc.runId;
      if (proc.shouldEscalate) {
        return finalizeEscalation({
          conversationId,
          workspaceId: input.workspaceId,
          agentId: input.agentId,
          message: "This request needs a human teammate. I've queued it with the conversation context.",
          reason: "procedure_escalation",
          started,
          useCase: agent.use_case,
          triggerMessageId: userMessageId,
          customerMessage: input.message,
          procedureSelection: { id: proc.procedure.id, name: proc.procedure.name, step: proc.currentStep },
        });
      }
    }
  } catch {
    /* procedure_runs table may be missing before migration — continue without */
  }

  const actions = await listAgentActions(input.agentId);
  const actionsPrompt = actions.length ? actionsToPrompt(actions) : null;

  // Optional tool execution before model
  let toolResultBlock = "";
  let orderWidget: StructuredUi | null = null;
  let commerceParts: MessagePart[] = [];
  const intent = detectActionIntent(input.message, actions);
  if (intent) {
    const result = await executeAction({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      conversationId,
      action: intent.action,
      args: intent.args,
      verifiedIdentity: input.verifiedIdentity,
      guardrails: rules,
    });
    if (result.ok) {
      toolResultBlock = `\nTool result (${intent.action.slug}):\n${JSON.stringify(result.output, null, 2)}`;
      const out = result.output as {
        orderId?: string;
        status?: string;
        eta?: string;
        trackingUrl?: string;
      };
      if (out.orderId && out.status) {
        orderWidget = {
          type: "order_status",
          orderId: out.orderId,
          status: out.status,
          eta: out.eta,
          trackingUrl: out.trackingUrl,
        };
      }
      if (Array.isArray(result.parts)) {
        commerceParts = result.parts as MessagePart[];
      }
    } else if (result.needsConfirmation) {
      toolResultBlock = `\nAction ${intent.action.slug} requires confirmation before running.`;
    } else {
      toolResultBlock = `\nAction ${intent.action.slug} failed: ${result.error}`;
    }
  }

  const system = composeSystemPrompt({
    agentName: agent.name,
    organizationName: agent.institution_name || agent.workspace_name,
    instructions: agent.instructions,
    brandVoice: agent.brand_voice,
    knowledgeMode: agent.knowledge_mode,
    knowledgeContext: grounded + toolResultBlock,
    pageContext,
    guardrails: rules,
    procedurePrompt,
    actionsPrompt,
    verifiedIdentity: input.verifiedIdentity as Record<string, string> | null | undefined,
    language: input.language || detectLanguage(input.message),
  });

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
      provider: agent.model_provider,
      temperature: agent.temperature,
      maxTokens: agent.max_tokens,
      fallbackModel: agent.fallback_model_id || undefined,
    },
  );

  let replyText = result.text;
  const postModel = evaluateGuardrails({
    rules,
    scope: "post_model",
    message: replyText,
    confidence: chunks.length ? Math.min(0.95, 0.45 + (chunks[0]?.score || 0) * 0.2) : 0.25,
  });
  if (postModel.matched.some((r) => r.action === "rewrite" || r.action === "block")) {
    // Only replace when the model invented a forbidden claim — not when echoing our own guardrail copy
    const rewriteMsg = postModel.message;
    if (rewriteMsg && replyText !== rewriteMsg && !replyText.includes(rewriteMsg)) {
      replyText = rewriteMsg;
    } else if (!postModel.allow) {
      replyText = rewriteMsg || "I can't help with that request.";
    }
  }
  if (postModel.escalate) {
    return finalizeEscalation({
      conversationId,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      message: replyText + "\n\n" + (postModel.message || "I've flagged this for a human teammate."),
      reason: "post_model_escalation",
      started,
      useCase: agent.use_case,
      triggerMessageId: userMessageId,
      customerMessage: input.message,
      guardrailDecisions: { preModel, postModel },
    });
  }

  const confidencePreview = chunks.length
    ? Math.min(0.95, 0.45 + (chunks[0]?.score || 0) * 0.2)
    : 0.25;
  if (agent.knowledge_mode === "strict" && chunks.length === 0 && confidencePreview < 0.35) {
    return finalizeEscalation({
      conversationId,
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      message:
        "I don't have enough verified information to answer confidently. Connecting you with a human teammate who can help.",
      reason: "low_confidence",
      started,
      useCase: agent.use_case,
      triggerMessageId: userMessageId,
      customerMessage: input.message,
      guardrailDecisions: { preModel, postModel, lowConfidence: true },
    });
  }

  const citations: ChatCitation[] = agent.show_citations
    ? chunks.slice(0, 3).map((c) => ({
        title: c.title || c.heading || "Source",
        url: c.url,
        snippet: c.text.slice(0, 240),
      }))
    : [];

  const structuredUi =
    orderWidget || inferStructuredUi(input.message, agent.use_case);
  const partsPayload = buildMessageParts(replyText, citations, structuredUi, commerceParts);
  const confidence = chunks.length ? Math.min(0.95, 0.45 + (chunks[0]?.score || 0) * 0.2) : 0.25;
  const assistantMessageId = createId("msg");
  const latency = Date.now() - started;

  await db
    .prepare(
      `INSERT INTO messages
      (id, conversation_id, role, content, citations, retrieval_trace, structured_ui, parts, model_id, latency_ms, confidence, agent_version_id, created_at)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      assistantMessageId,
      conversationId,
      replyText,
      JSON.stringify(citations),
      JSON.stringify(
        input.debug
          ? {
              chunks: chunks.map((c) => ({ id: c.id, score: c.score, title: c.title, url: c.url })),
              procedureRunId,
              tools: intent?.action.slug,
            }
          : { count: chunks.length, procedureRunId },
      ),
      JSON.stringify(structuredUi),
      JSON.stringify(partsPayload.parts),
      result.model,
      latency,
      confidence,
      agent.published_version_id || null,
      nowIso(),
    )
    .run();

  if (procedureRunId) {
    try {
      await advanceProcedureRun(procedureRunId, 1);
    } catch {
      /* ignore */
    }
  }

  const sentiment = classifySentiment(input.message);
  const topic = classifyTopic(input.message);
  const language = input.language || detectLanguage(input.message);

  await db
    .prepare(
      `UPDATE conversations
       SET message_count = message_count + 2,
           last_message_at = ?,
           updated_at = ?,
           topic = COALESCE(topic, ?),
           sentiment = ?,
           sentiment_score = ?,
           language = COALESCE(language, ?)
       WHERE id = ?`,
    )
    .bind(nowIso(), nowIso(), topic, sentiment.label, sentiment.score, language, conversationId)
    .run();

  try {
    await recordConversationSignals({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      conversationId,
      question: input.message,
      confidence,
      chunkCount: chunks.length,
    });
  } catch {
    /* knowledge_gaps tables may be missing before migration */
  }

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
      JSON.stringify({
        latency_ms: latency,
        confidence,
        model: result.model,
        procedureRunId,
        topic,
        sentiment: sentiment.label,
        channel: input.channel || "playground",
      }),
      nowIso(),
    )
    .run();

  const traceId = await saveAgentTrace({
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    conversationId,
    messageId: assistantMessageId,
    input: input.message,
    intent: intent?.action.slug || topic,
    retrievedContext: chunks.map((c) => ({ id: c.id, title: c.title, score: c.score, url: c.url })),
    procedureSelection: procedureRunId ? { procedureRunId } : null,
    llmRun: { model: result.model, provider: result.provider, latencyMs: latency },
    toolCalls: intent
      ? [{ name: intent.action.slug, args: intent.args }]
      : [],
    guardrailDecisions: { preModel, postModel },
    finalResponse: replyText,
  });

  return {
    conversationId,
    messageId: assistantMessageId,
    content: replyText,
    parts: partsPayload.parts,
    citations,
    structuredUi,
    confidence,
    latencyMs: latency,
    model: result.model,
    retrieval: chunks,
    procedureRunId,
    traceId,
    starterQuestions: STARTER_QUESTIONS[agent.use_case] || STARTER_QUESTIONS.custom,
  };
}

async function finalizeEscalation(input: {
  conversationId: string;
  workspaceId: string;
  agentId: string;
  message: string;
  reason: string;
  started: number;
  useCase: string;
  triggerMessageId?: string;
  customerMessage?: string;
  guardrailDecisions?: unknown;
  procedureSelection?: unknown;
}) {
  const assistantMessageId = createId("msg");
  const latency = Date.now() - input.started;
  const parts = textToParts(input.message, [
    {
      type: "button_group",
      items: [{ label: "Wait for human", action: "handoff" }],
    },
  ]);

  const db = await getDb();
  await db
    .prepare(
      `INSERT INTO messages
      (id, conversation_id, role, content, structured_ui, parts, latency_ms, confidence, created_at)
      VALUES (?, ?, 'assistant', ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      assistantMessageId,
      input.conversationId,
      input.message,
      JSON.stringify({
        type: "buttons",
        items: [{ label: "Wait for human", action: "handoff" }],
      }),
      JSON.stringify(parts.parts),
      latency,
      1,
      nowIso(),
    )
    .run();

  await db
    .prepare(
      `UPDATE conversations SET message_count = message_count + 2 WHERE id = ?`,
    )
    .bind(input.conversationId)
    .run();

  let escalationResult: Awaited<ReturnType<typeof escalateConversation>> | null = null;
  try {
    escalationResult = await escalateConversation({
      workspaceId: input.workspaceId,
      agentId: input.agentId,
      conversationId: input.conversationId,
      reason: input.reason,
      triggerMessageId: input.triggerMessageId,
      customerMessage: input.customerMessage,
    });
  } catch {
    // Fallback if escalations table missing
    await db
      .prepare(
        `UPDATE conversations
         SET handoff_status = 'escalated', status = 'open', last_message_at = ?, updated_at = ?,
             metadata = ?
         WHERE id = ?`,
      )
      .bind(
        nowIso(),
        nowIso(),
        JSON.stringify({ escalation_reason: input.reason }),
        input.conversationId,
      )
      .run();
  }

  await saveAgentTrace({
    workspaceId: input.workspaceId,
    agentId: input.agentId,
    conversationId: input.conversationId,
    messageId: assistantMessageId,
    input: input.customerMessage || input.message,
    intent: "escalation",
    procedureSelection: input.procedureSelection,
    guardrailDecisions: input.guardrailDecisions,
    escalationDecision: {
      reason: input.reason,
      escalationId: escalationResult?.escalationId,
      summary: escalationResult?.summaryText,
    },
    finalResponse: input.message,
  });

  return {
    conversationId: input.conversationId,
    messageId: assistantMessageId,
    content: input.message,
    parts: parts.parts,
    citations: [] as ChatCitation[],
    structuredUi: {
      type: "buttons" as const,
      items: [{ label: "Wait for human", action: "handoff" }],
    },
    confidence: 1,
    latencyMs: latency,
    model: "escalation",
    escalated: true,
    ticketId: escalationResult?.ticketId,
    escalationId: escalationResult?.escalationId,
    handoffSummary: escalationResult?.summaryText,
    starterQuestions: STARTER_QUESTIONS[input.useCase] || STARTER_QUESTIONS.custom,
  };
}

function buildMessageParts(
  text: string,
  citations: ChatCitation[],
  structuredUi: StructuredUi | null,
  extraParts: MessagePart[] = [],
): AgentMessagePayload {
  const extra: MessagePart[] = [...extraParts];
  if (citations.length) {
    extra.push({
      type: "citations",
      items: citations.map((c) => ({ title: c.title, url: c.url, snippet: c.snippet })),
    });
  }
  if (structuredUi?.type === "buttons") {
    extra.push({ type: "button_group", items: structuredUi.items });
  }
  if (structuredUi?.type === "lead_form") {
    extra.push({
      type: "form",
      title: structuredUi.title,
      formId: "lead",
      fields: structuredUi.fields.map((name) => ({
        name,
        label: name,
        required: name === "email" || name === "name",
      })),
    });
  }
  if (structuredUi?.type === "course_cards") {
    for (const item of structuredUi.items) {
      extra.push({
        type: "course_card",
        title: item.title,
        subtitle: item.subtitle,
        href: item.href,
      });
    }
  }
  if (structuredUi?.type === "order_status" && !extra.some((p) => p.type === "order_status")) {
    extra.push({
      type: "order_status",
      orderId: structuredUi.orderId,
      status: structuredUi.status,
      eta: structuredUi.eta,
      trackingUrl: structuredUi.trackingUrl,
    });
  }
  if (structuredUi?.type === "cta") {
    extra.push({ type: "cta", label: structuredUi.label, href: structuredUi.href });
  }
  return textToParts(text, extra);
}

function inferStructuredUi(message: string, useCase: string): StructuredUi | null {
  const m = message.toLowerCase();
  if (/(apply|application|enroll)/.test(m) && /admission|student|course/.test(useCase + m)) {
    return {
      type: "buttons",
      items: [
        { label: "Start application", action: "start_application" },
        { label: "Talk to admissions", action: "handoff" },
      ],
    };
  }
  if (/(brochure|contact me|interested|demo|talk to sales)/.test(m) || useCase === "sales") {
    if (/(brochure|contact|demo|interested|sales)/.test(m)) {
      return {
        type: "lead_form",
        title: "Share your details",
        fields: ["name", "email", "company", "use_case"],
      };
    }
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
