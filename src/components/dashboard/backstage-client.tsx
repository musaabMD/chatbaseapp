"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input, Label } from "@/components/ui/input";

type Suggestion = {
  id: string;
  type: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
};

export function BackstageClient({
  initialSuggestions,
  agents,
}: {
  initialSuggestions: Suggestion[];
  agents: Array<{ id: string; name: string }>;
}) {
  const [message, setMessage] = useState("Summarize the biggest customer issues this week.");
  const [agentId, setAgentId] = useState(agents[0]?.id || "");
  const [reply, setReply] = useState("");
  const [suggestions, setSuggestions] = useState(initialSuggestions);
  const [loading, setLoading] = useState(false);

  async function ask() {
    setLoading(true);
    try {
      const res = await fetch("/api/backstage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "ask", message, agentId: agentId || undefined }),
      });
      const data = (await res.json()) as {
        error?: string;
        content?: string;
        suggestionIds?: string[];
      };
      if (!res.ok) throw new Error(data.error || "Backstage failed");
      setReply(data.content || "");
      const refresh = await fetch("/api/backstage");
      const refreshed = (await refresh.json()) as { suggestions?: Suggestion[] };
      setSuggestions(refreshed.suggestions || []);
      toast.success("Backstage replied");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function act(suggestionId: string, action: "apply" | "reject") {
    try {
      const res = await fetch("/api/backstage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, suggestionId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      setSuggestions((prev) =>
        prev.map((s) =>
          s.id === suggestionId ? { ...s, status: action === "apply" ? "applied" : "rejected" } : s,
        ),
      );
      toast.success(action === "apply" ? "Applied as draft artifact" : "Rejected");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Backstage
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Your agent, offstage. Ask about customers, escalate patterns, and propose fixes — changes need approval.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ask Backstage</CardTitle>
          <CardDescription>
            Examples: “Why are billing escalations increasing?” · “What are customers asking about Feature X?”
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {agents.length > 0 && (
            <div className="space-y-2">
              <Label>Focus agent (optional)</Label>
              <select
                className="w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
              >
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="space-y-2">
            <Label>Question</Label>
            <Input value={message} onChange={(e) => setMessage(e.target.value)} />
          </div>
          <Button onClick={ask} disabled={loading}>
            {loading ? "Thinking…" : "Ask"}
          </Button>
          {reply && (
            <pre className="whitespace-pre-wrap rounded-2xl bg-[var(--secondary)]/50 p-4 text-sm">{reply}</pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proposed improvements</CardTitle>
          <CardDescription>Approve to create draft FAQs or test cases — never silent production edits.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {suggestions.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No suggestions yet. Ask Backstage to propose fixes.</p>
          )}
          {suggestions.map((s) => (
            <div key={s.id} className="rounded-2xl border border-[var(--border)] p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="text-xs uppercase tracking-wide text-[var(--muted)]">{s.type}</div>
                  <div className="font-medium">{s.title}</div>
                </div>
                <div className="text-xs text-[var(--muted)]">{s.status}</div>
              </div>
              <p className="mt-2 text-sm text-[var(--muted)]">{s.body}</p>
              {s.status === "proposed" && (
                <div className="mt-3 flex gap-2">
                  <Button size="sm" onClick={() => act(s.id, "apply")}>
                    Approve draft
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => act(s.id, "reject")}>
                    Reject
                  </Button>
                </div>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
