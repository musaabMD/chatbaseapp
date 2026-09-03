"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const TONES = ["friendly", "professional", "concise", "empathetic"];
const KNOWLEDGE_MODES = ["strict", "balanced", "general"];

export function InstructionsEditor({
  agentId,
  initialInstructions,
  initialTone,
  initialKnowledgeMode,
}: {
  agentId: string;
  initialInstructions: string;
  initialTone: string;
  initialKnowledgeMode: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [instructions, setInstructions] = useState(initialInstructions);
  const [tone, setTone] = useState(initialTone);
  const [knowledgeMode, setKnowledgeMode] = useState(initialKnowledgeMode);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agentId,
          instructions,
          tone,
          knowledge_mode: knowledgeMode,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Save failed");
      toast.success("Instructions saved");
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
          <CardTitle>System instructions</CardTitle>
          <CardDescription>
            Define how the assistant behaves, what it can do, and when to escalate.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="instructions">Instructions</Label>
            <Textarea
              id="instructions"
              rows={16}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              className="font-mono text-xs"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="tone">Tone</Label>
              <select
                id="tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-white/80 px-3 text-sm"
              >
                {TONES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="knowledge">Knowledge mode</Label>
              <select
                id="knowledge"
                value={knowledgeMode}
                onChange={(e) => setKnowledgeMode(e.target.value)}
                className="flex h-11 w-full rounded-xl border border-[var(--border)] bg-white/80 px-3 text-sm"
              >
                {KNOWLEDGE_MODES.map((m) => (
                  <option key={m} value={m}>{m}</option>
                ))}
              </select>
            </div>
          </div>

          <Button onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save instructions"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
