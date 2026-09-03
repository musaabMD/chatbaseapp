"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { safeJsonParse } from "@/lib/utils";

type Action = {
  id: string;
  name: string;
  slug: string;
  type: string;
  description: string | null;
  enabled: number;
  config: string | null;
};

export function ActionsManager({ agentId }: { agentId: string }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("POST");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/actions?agentId=${agentId}`);
    const data = (await res.json()) as Record<string, unknown>;
    setActions((data.actions as Action[]) || []);
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !url.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          name: name.trim(),
          type: "http",
          config: { url: url.trim(), method },
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Failed");
      toast.success("Action created");
      setName("");
      setUrl("");
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>HTTP actions</CardTitle>
          <CardDescription>
            Connect external APIs the assistant can call during conversations.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {actions.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No actions configured.</p>
          ) : (
            actions.map((a) => {
              const config = safeJsonParse<{ url?: string; method?: string }>(a.config, {});
              return (
                <div
                  key={a.id}
                  className="rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">{a.name}</div>
                    <Badge>{a.type}</Badge>
                  </div>
                  <div className="mt-1 font-mono text-xs text-[var(--muted)]">
                    {config.method || "POST"} {config.url || "—"}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Add HTTP action</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Check application status" />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/status" />
            </div>
            <div className="space-y-2">
              <Label>Method</Label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-white/80 px-3 text-sm"
              >
                <option value="GET">GET</option>
                <option value="POST">POST</option>
                <option value="PUT">PUT</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button type="submit" disabled={busy}>Create action</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
