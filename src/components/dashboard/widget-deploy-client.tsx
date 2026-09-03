"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeJsonParse } from "@/lib/utils";

type WidgetConfig = {
  position?: string;
  primaryColor?: string;
  welcomeMessage?: string;
  placeholder?: string;
  starterQuestions?: boolean;
  showSources?: boolean;
  showFeedback?: boolean;
};

type Domain = { id: string; domain: string };

export function WidgetDeployClient({
  agentId,
  publicSlug,
  initialWidgetConfig,
}: {
  agentId: string;
  publicSlug: string;
  initialWidgetConfig: WidgetConfig;
}) {
  const router = useRouter();
  const [domains, setDomains] = useState<Domain[]>([]);
  const [newDomain, setNewDomain] = useState("");
  const [config, setConfig] = useState(initialWidgetConfig);
  const [busy, setBusy] = useState(false);

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.campusly.ai";
  const snippet = `<script src="${origin}/widget.js" data-agent-id="${agentId}" async></script>`;

  const loadDomains = useCallback(async () => {
    const res = await fetch(`/api/domains?agentId=${agentId}`);
    const data = (await res.json()) as Record<string, unknown>;
    setDomains((data.domains as Domain[]) || []);
  }, [agentId]);

  useEffect(() => {
    void loadDomains();
  }, [loadDomains]);

  async function addDomain(e: React.FormEvent) {
    e.preventDefault();
    if (!newDomain.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, domain: newDomain.trim() }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Failed");
      toast.success("Domain added");
      setNewDomain("");
      await loadDomains();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function removeDomain(id: string) {
    await fetch(`/api/domains?id=${id}`, { method: "DELETE" });
    await loadDomains();
  }

  async function saveConfig() {
    setBusy(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, widget_config: config }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Save failed");
      toast.success("Widget config saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Install snippet</CardTitle>
          <CardDescription>
            Paste before the closing &lt;/body&gt; tag on your institution website.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-xl bg-[var(--secondary)]/60 p-4 text-xs font-mono">
            {snippet}
          </pre>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Public page: <a href={`/a/${publicSlug}`} className="underline" target="_blank" rel="noreferrer">/a/{publicSlug}</a>
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Allowed domains</CardTitle>
          <CardDescription>Restrict widget usage to approved hostnames.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {domains.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No restrictions (all domains allowed when empty).</p>
            ) : (
              domains.map((d) => (
                <div key={d.id} className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-sm">
                  <span>{d.domain}</span>
                  <Button size="sm" variant="ghost" onClick={() => removeDomain(d.id)}>Remove</Button>
                </div>
              ))
            )}
          </div>
          <form onSubmit={addDomain} className="flex gap-2">
            <Input
              placeholder="university.edu"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
            />
            <Button type="submit" disabled={busy}>Add</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Widget appearance</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Primary color</Label>
            <Input
              type="color"
              value={config.primaryColor || "#0C5C4C"}
              onChange={(e) => setConfig({ ...config, primaryColor: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Welcome message</Label>
            <Input
              value={config.welcomeMessage || ""}
              onChange={(e) => setConfig({ ...config, welcomeMessage: e.target.value })}
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Placeholder</Label>
            <Input
              value={config.placeholder || ""}
              onChange={(e) => setConfig({ ...config, placeholder: e.target.value })}
            />
          </div>
          <div className="flex flex-wrap gap-4 sm:col-span-2">
            {[
              ["starterQuestions", "Starter questions"],
              ["showSources", "Show sources"],
              ["showFeedback", "Show feedback"],
            ].map(([key, label]) => (
              <label key={key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(config[key as keyof WidgetConfig])}
                  onChange={(e) => setConfig({ ...config, [key]: e.target.checked })}
                />
                {label}
              </label>
            ))}
          </div>
          <Button onClick={saveConfig} disabled={busy}>Save widget config</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function parseWidgetConfig(raw: string | null): WidgetConfig {
  return safeJsonParse<WidgetConfig>(raw, {
    position: "bottom-right",
    primaryColor: "#0C5C4C",
    welcomeMessage: "Hi! How can I help?",
    placeholder: "Ask a question...",
    starterQuestions: true,
    showSources: true,
    showFeedback: true,
  });
}
