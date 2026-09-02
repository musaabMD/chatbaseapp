"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

type Source = {
  id: string;
  name: string;
  type: string;
  status: string;
  characters: number;
  page_count: number;
  url: string | null;
  updated_at: string;
};

export function SourcesManager({ agentId }: { agentId: string }) {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [textTitle, setTextTitle] = useState("");
  const [textContent, setTextContent] = useState("");
  const [qaName, setQaName] = useState("");
  const [qaQuestion, setQaQuestion] = useState("");
  const [qaAnswer, setQaAnswer] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/sources?agentId=${agentId}`);
    const data = await res.json();
    setSources(data.sources || []);
    setLoading(false);
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function addWebsite(e: React.FormEvent) {
    e.preventDefault();
    if (!websiteUrl.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "website", agentId, url: websiteUrl.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Website source added and training started");
      setWebsiteUrl("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addText(e: React.FormEvent) {
    e.preventDefault();
    if (!textTitle.trim() || !textContent.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "text",
          agentId,
          title: textTitle.trim(),
          content: textContent.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Text source added");
      setTextTitle("");
      setTextContent("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function addQa(e: React.FormEvent) {
    e.preventDefault();
    if (!qaName.trim() || !qaQuestion.trim() || !qaAnswer.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "qa",
          agentId,
          name: qaName.trim(),
          pairs: [{ question: qaQuestion.trim(), answer: qaAnswer.trim() }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Q&A pair added");
      setQaName("");
      setQaQuestion("");
      setQaAnswer("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeSource(id: string) {
    const res = await fetch(`/api/sources?id=${id}`, { method: "DELETE" });
    if (!res.ok) {
      toast.error("Delete failed");
      return;
    }
    toast.success("Source removed");
    await load();
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Knowledge sources</CardTitle>
          <CardDescription>
            Add websites, documents, and Q&A pairs to train your assistant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-[var(--muted)]">Loading…</p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No sources yet.</p>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3"
                >
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="text-xs text-[var(--muted)]">
                      {s.type} · {s.status} · {s.characters.toLocaleString()} chars
                      {s.page_count > 0 && ` · ${s.page_count} pages`}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{s.status}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => removeSource(s.id)}>
                      Remove
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Website</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addWebsite} className="space-y-3">
              <div className="space-y-2">
                <Label>URL</Label>
                <Input
                  placeholder="https://university.edu/admissions"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                />
              </div>
              <Button type="submit" size="sm" disabled={busy}>Crawl & train</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Text</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addText} className="space-y-3">
              <div className="space-y-2">
                <Label>Title</Label>
                <Input value={textTitle} onChange={(e) => setTextTitle(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Content</Label>
                <Textarea rows={4} value={textContent} onChange={(e) => setTextContent(e.target.value)} />
              </div>
              <Button type="submit" size="sm" disabled={busy}>Add text</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Q&A</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={addQa} className="space-y-3">
              <div className="space-y-2">
                <Label>Collection name</Label>
                <Input value={qaName} onChange={(e) => setQaName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Question</Label>
                <Input value={qaQuestion} onChange={(e) => setQaQuestion(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Answer</Label>
                <Textarea rows={3} value={qaAnswer} onChange={(e) => setQaAnswer(e.target.value)} />
              </div>
              <Button type="submit" size="sm" disabled={busy}>Add Q&A</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
