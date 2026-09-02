"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export type GuardrailsConfig = {
  blockedTopics?: string[];
  maxResponseLength?: number;
  requireCitations?: boolean;
  piiFilter?: boolean;
  blockExternalLinks?: boolean;
  escalationKeywords?: string[];
};

export function GuardrailsEditor({
  agentId,
  initialGuardrails,
}: {
  agentId: string;
  initialGuardrails: GuardrailsConfig;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [json, setJson] = useState(JSON.stringify(initialGuardrails, null, 2));

  async function save() {
    setLoading(true);
    try {
      const parsed = JSON.parse(json) as GuardrailsConfig;
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, guardrails: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Guardrails saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Invalid JSON or save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Guardrails</CardTitle>
          <CardDescription>
            Configure safety rules, blocked topics, and escalation triggers as JSON.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Guardrails JSON</Label>
            <Textarea
              rows={18}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <p className="text-xs text-[var(--muted)]">
            Fields: blockedTopics, maxResponseLength, requireCitations, piiFilter,
            blockExternalLinks, escalationKeywords
          </p>
          <Button onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save guardrails"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
