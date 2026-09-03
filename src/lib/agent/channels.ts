import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";

export type IncomingEvent = {
  conversationId?: string;
  customerId?: string;
  channel: string;
  messageType?: "text" | "audio" | "image" | "file";
  text: string;
  attachments?: Array<{ url: string; mime?: string }>;
  metadata?: Record<string, unknown>;
  verifiedIdentity?: Record<string, string | number | boolean | null>;
  timestamp?: number;
};

export type OutgoingEvent = {
  conversationId: string;
  channel: string;
  text: string;
  parts?: unknown[];
  metadata?: Record<string, unknown>;
};

/**
 * Normalize any channel into one internal event shape.
 * Channel-specific adapters call this before AgentRuntime.
 */
export function normalizeIncoming(
  channel: string,
  raw: Record<string, unknown>,
): IncomingEvent {
  return {
    conversationId: typeof raw.conversationId === "string" ? raw.conversationId : undefined,
    customerId: typeof raw.customerId === "string" ? raw.customerId : undefined,
    channel,
    messageType: (raw.messageType as IncomingEvent["messageType"]) || "text",
    text: String(raw.text || raw.body || raw.message || ""),
    attachments: Array.isArray(raw.attachments) ? (raw.attachments as IncomingEvent["attachments"]) : undefined,
    metadata: (raw.metadata as Record<string, unknown>) || {},
    verifiedIdentity: (raw.verifiedIdentity || raw.identity) as IncomingEvent["verifiedIdentity"],
    timestamp: typeof raw.timestamp === "number" ? raw.timestamp : Date.now(),
  };
}

export async function recordChannelEvent(input: {
  workspaceId: string;
  agentId?: string;
  conversationId?: string;
  channel: string;
  direction: "inbound" | "outbound";
  payload: unknown;
  status?: string;
}) {
  const db = await getDb();
  const id = createId("cevt");
  await db
    .prepare(
      `INSERT INTO channel_events
      (id, workspace_id, agent_id, conversation_id, channel, direction, payload, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      input.workspaceId,
      input.agentId || null,
      input.conversationId || null,
      input.channel,
      input.direction,
      JSON.stringify(input.payload),
      input.status || "received",
      nowIso(),
    )
    .run();
  return id;
}

/** Render MessageParts for channel-specific delivery */
export function renderForChannel(channel: string, text: string, parts?: unknown[]) {
  if (channel === "email") {
    return {
      subject: text.slice(0, 80),
      html: `<p>${text.replace(/\n/g, "<br/>")}</p>`,
      text,
    };
  }
  if (channel === "whatsapp" || channel === "messenger" || channel === "instagram") {
    return { text, interactive: parts || [] };
  }
  if (channel === "slack") {
    return { text, blocks: [{ type: "section", text: { type: "mrkdwn", text } }] };
  }
  if (channel === "voice") {
    return { speak: text, ssml: `<speak>${text}</speak>` };
  }
  // website / in-app / playground
  return { text, parts: parts || [] };
}

export const SUPPORTED_CHANNELS = [
  "widget",
  "playground",
  "hosted",
  "api",
  "in_app",
  "email",
  "whatsapp",
  "messenger",
  "instagram",
  "slack",
  "voice",
] as const;
