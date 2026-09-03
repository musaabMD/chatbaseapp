"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Loader2, ThumbsDown, ThumbsUp } from "lucide-react";

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citations?: Array<{ title: string; url?: string | null; snippet: string }>;
  structuredUi?: {
    type: string;
    title?: string;
    fields?: string[];
    items?: Array<{ label?: string; title?: string; subtitle?: string; action?: string; href?: string }>;
    label?: string;
    href?: string;
    orderId?: string;
    status?: string;
    eta?: string;
    trackingUrl?: string;
  } | null;
};

export function ChatPanel({
  agentId,
  apiPath = "/api/chat",
  conversationId: initialConversationId,
  starterQuestions = [],
  debug = false,
  onDebug,
  className,
  pageUrl,
  pageTitle,
  channel = "playground",
  public: isPublic = false,
}: {
  agentId: string;
  apiPath?: string;
  conversationId?: string;
  starterQuestions?: string[];
  debug?: boolean;
  onDebug?: (payload: unknown) => void;
  className?: string;
  pageUrl?: string;
  pageTitle?: string;
  channel?: string;
  public?: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [conversationId, setConversationId] = useState(initialConversationId);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function send(text: string) {
    if (!text.trim() || busy) return;
    setBusy(true);
    const userMsg: ChatMessageView = {
      id: `local_${Date.now()}`,
      role: "user",
      content: text.trim(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");

    try {
      const res = await fetch(apiPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          message: text.trim(),
          conversationId,
          debug,
          pageUrl,
          pageTitle,
          channel,
          public: isPublic || undefined,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Chat failed");
      setConversationId(data.conversationId as string | undefined);
      setMessages((m) => [
        ...m,
        {
          id: String(data.messageId),
          role: "assistant",
          content: String(data.content || ""),
          citations: data.citations as ChatMessageView["citations"],
          structuredUi: data.structuredUi as ChatMessageView["structuredUi"],
        },
      ]);
      onDebug?.(data);
    } catch (error) {
      setMessages((m) => [
        ...m,
        {
          id: `err_${Date.now()}`,
          role: "assistant",
          content: error instanceof Error ? error.message : "Something went wrong",
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function feedback(messageId: string, value: 1 | -1) {
    await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messageId, value, conversationId }),
    });
  }

  return (
    <div className={cn("flex h-full flex-col", className)}>
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--muted)]">Try a starter question</p>
            <div className="flex flex-wrap gap-2">
              {starterQuestions.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="rounded-full border border-[var(--border)] bg-white/80 px-3 py-1.5 text-left text-sm hover:bg-white"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed", {
              "ml-auto bg-[var(--primary)] text-white": m.role === "user",
              "bg-white/90 text-[var(--foreground)] shadow-sm": m.role === "assistant",
            })}
          >
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.citations && m.citations.length > 0 && (
              <div className="mt-3 space-y-1 border-t border-black/5 pt-2">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Sources</div>
                {m.citations.map((c, idx) => (
                  <div key={`${c.title}-${idx}`} className="text-xs opacity-90">
                    {c.url ? (
                      <a href={c.url} target="_blank" rel="noreferrer" className="underline">
                        {c.title}
                      </a>
                    ) : (
                      c.title
                    )}
                  </div>
                ))}
              </div>
            )}
            {m.structuredUi?.type === "buttons" && (
              <div className="mt-3 flex flex-wrap gap-2">
                {m.structuredUi.items?.map((item) => (
                  <Button key={item.label} size="sm" variant="secondary" onClick={() => send(item.label || "")}>
                    {item.label}
                  </Button>
                ))}
              </div>
            )}
            {m.structuredUi?.type === "lead_form" && (
              <form
                className="mt-3 space-y-2 rounded-xl bg-[var(--secondary)]/60 p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const fd = new FormData(e.currentTarget);
                  void fetch("/api/leads", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      agentId,
                      conversationId,
                      name: fd.get("name"),
                      email: fd.get("email"),
                      program: fd.get("program"),
                      intake: fd.get("intake"),
                    }),
                  }).then(() => send("I submitted my contact details."));
                }}
              >
                <div className="text-xs font-semibold">{m.structuredUi.title}</div>
                {(m.structuredUi.fields || ["name", "email"]).map((field) => (
                  <Input key={field} name={field} placeholder={field} required={field === "email" || field === "name"} />
                ))}
                <Button size="sm" type="submit">
                  Submit
                </Button>
              </form>
            )}
            {m.structuredUi?.type === "course_cards" && (
              <div className="mt-3 grid gap-2">
                {m.structuredUi.items?.map((item) => (
                  <div key={item.title} className="rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-3">
                    <div className="font-medium">{item.title}</div>
                    <div className="text-xs opacity-70">{item.subtitle}</div>
                  </div>
                ))}
              </div>
            )}
            {m.structuredUi?.type === "order_status" && (
              <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--secondary)]/50 p-3">
                <div className="text-[11px] font-semibold uppercase tracking-wide opacity-70">Order status</div>
                <div className="mt-1 font-medium">
                  {(m.structuredUi as { orderId?: string }).orderId} ·{" "}
                  {(m.structuredUi as { status?: string }).status}
                </div>
                {(m.structuredUi as { eta?: string }).eta && (
                  <div className="text-xs opacity-70">ETA: {(m.structuredUi as { eta?: string }).eta}</div>
                )}
              </div>
            )}
            {m.role === "assistant" && !m.id.startsWith("err_") && !m.id.startsWith("local_") && (
              <div className="mt-2 flex gap-2">
                <button onClick={() => feedback(m.id, 1)} className="opacity-60 hover:opacity-100">
                  <ThumbsUp className="h-3.5 w-3.5" />
                </button>
                <button onClick={() => feedback(m.id, -1)} className="opacity-60 hover:opacity-100">
                  <ThumbsDown className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
        {busy && (
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white/90 px-4 py-3 text-sm text-[var(--muted)]">
            <Loader2 className="h-4 w-4 animate-spin" /> Thinking…
          </div>
        )}
        <div ref={endRef} />
      </div>
      <form
        className="flex gap-2 border-t border-[var(--border)] p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <Input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about orders, policies, pricing…" />
        <Button type="submit" disabled={busy}>
          Send
        </Button>
      </form>
    </div>
  );
}
