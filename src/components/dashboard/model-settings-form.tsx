"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { MODELS } from "@/lib/llm/provider";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function ModelSettingsForm({
  agentId,
  initialModelId,
  initialFallback,
  initialTemperature,
  initialMaxTokens,
  initialShowCitations,
}: {
  agentId: string;
  initialModelId: string;
  initialFallback: string;
  initialTemperature: number;
  initialMaxTokens: number;
  initialShowCitations: boolean;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [modelId, setModelId] = useState(initialModelId);
  const [fallback, setFallback] = useState(initialFallback);
  const [temperature, setTemperature] = useState(initialTemperature);
  const [maxTokens, setMaxTokens] = useState(initialMaxTokens);
  const [showCitations, setShowCitations] = useState(initialShowCitations);

  async function save() {
    setLoading(true);
    try {
      const selected = MODELS.find((m) => m.id === modelId);
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agentId,
          model_id: modelId,
          model_provider: selected?.provider || "workers-ai",
          fallback_model_id: fallback || null,
          temperature,
          max_tokens: maxTokens,
          show_citations: showCitations ? 1 : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Model settings saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Model settings</CardTitle>
          <CardDescription>Choose the LLM and generation parameters.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Primary model</Label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-white/80 px-3 text-sm"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label>Fallback model (optional)</Label>
            <select
              value={fallback}
              onChange={(e) => setFallback(e.target.value)}
              className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-white/80 px-3 text-sm"
            >
              <option value="">None</option>
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Temperature ({temperature})</Label>
              <input
                type="range"
                min={0}
                max={1}
                step={0.1}
                value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))}
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label>Max tokens</Label>
              <Input
                type="number"
                value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value, 10) || 1024)}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showCitations}
              onChange={(e) => setShowCitations(e.target.checked)}
            />
            Show source citations in responses
          </label>
          <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save model settings"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
