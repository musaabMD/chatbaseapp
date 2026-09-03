"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
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
  requires_confirmation: number;
  is_sensitive: number;
  config: string | null;
  input_schema: string | null;
};

export function ActionsManager({ agentId }: { agentId: string }) {
  const [actions, setActions] = useState<Action[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [url, setUrl] = useState("");
  const [method, setMethod] = useState("POST");
  const [headersJson, setHeadersJson] = useState("{}");
  const [inputSchemaJson, setInputSchemaJson] = useState(
    '{\n  "type": "object",\n  "properties": {\n    "order_id": { "type": "string" }\n  }\n}',
  );
  const [requiresConfirmation, setRequiresConfirmation] = useState(false);
  const [isSensitive, setIsSensitive] = useState(false);
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
      let headers: Record<string, string> = {};
      let inputSchema: Record<string, unknown> = {};
      try {
        headers = JSON.parse(headersJson) as Record<string, string>;
        inputSchema = JSON.parse(inputSchemaJson) as Record<string, unknown>;
      } catch {
        throw new Error("Headers / input schema must be valid JSON");
      }

      const res = await fetch("/api/actions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          name: name.trim(),
          description: description.trim() || undefined,
          type: "http",
          requiresConfirmation,
          isSensitive,
          config: { url: url.trim(), method, headers },
          inputSchema,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Failed");
      toast.success("Custom action created");
      setName("");
      setDescription("");
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
          <CardTitle>Actions / tools</CardTitle>
          <CardDescription>
            Custom API tools the agent can call server-side. Secrets stay in config — never in the browser or model prompt.
            Identity fields like customer_id are injected from verified context.
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
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{a.name}</div>
                    <div className="flex gap-1">
                      <Badge>{a.type}</Badge>
                      {a.is_sensitive ? <Badge className="bg-[var(--accent)]">sensitive</Badge> : null}
                      {a.requires_confirmation ? <Badge>confirm</Badge> : null}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--muted)]">{a.description}</div>
                  <div className="mt-1 font-mono text-xs text-[var(--muted)]">
                    {a.slug} · {config.method || "POST"} {config.url || "—"}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom action builder</CardTitle>
          <CardDescription>Endpoint, method, headers, input schema, confirmation policy.</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Lookup order" />
            </div>
            <div className="space-y-2">
              <Label>URL</Label>
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://api.example.com/orders" />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>When should the AI use this?</Label>
              <Input
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Use when the customer asks for order status"
              />
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
                <option value="PATCH">PATCH</option>
              </select>
            </div>
            <div className="flex flex-col justify-end gap-2 pb-1">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requiresConfirmation} onChange={(e) => setRequiresConfirmation(e.target.checked)} />
                Require confirmation
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={isSensitive} onChange={(e) => setIsSensitive(e.target.checked)} />
                Sensitive (guardrail)
              </label>
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Headers JSON (no secrets in client for production — store server-side)</Label>
              <Textarea rows={3} className="font-mono text-xs" value={headersJson} onChange={(e) => setHeadersJson(e.target.value)} />
            </div>
            <div className="space-y-2 sm:col-span-2">
              <Label>Input schema JSON</Label>
              <Textarea rows={6} className="font-mono text-xs" value={inputSchemaJson} onChange={(e) => setInputSchemaJson(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" disabled={busy}>{busy ? "Creating…" : "Create action"}</Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
