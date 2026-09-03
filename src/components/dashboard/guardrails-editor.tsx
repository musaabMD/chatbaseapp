"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GuardrailRule } from "@/lib/agent/guardrails";

export type GuardrailsConfig = {
  blockedTopics?: string[];
  maxResponseLength?: number;
  requireCitations?: boolean;
  piiFilter?: boolean;
  blockExternalLinks?: boolean;
  escalationKeywords?: string[];
  rules?: GuardrailRule[];
};

const EXAMPLE_RULES: GuardrailRule[] = [
  {
    name: "Human request escalation",
    condition: "human_request",
    scope: "pre_model",
    action: "escalate",
    severity: "medium",
    message: "A human teammate can take over this conversation.",
  },
  {
    name: "Block unsupported promises",
    condition: "keyword",
    pattern: "guarantee|definitely approved",
    scope: "post_model",
    action: "rewrite",
    severity: "high",
    message: "I can't guarantee outcomes that require official review.",
  },
  {
    name: "Sensitive action confirmation",
    condition: "sensitive_action",
    scope: "pre_tool",
    action: "require_confirmation",
    severity: "high",
    approvalRequired: true,
  },
];

export function GuardrailsEditor({
  agentId,
  initialGuardrails,
}: {
  agentId: string;
  initialGuardrails: GuardrailsConfig | GuardrailRule[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [json, setJson] = useState(
    JSON.stringify(
      Array.isArray(initialGuardrails)
        ? initialGuardrails
        : initialGuardrails.rules?.length
          ? initialGuardrails.rules
          : EXAMPLE_RULES,
      null,
      2,
    ),
  );

  async function save() {
    setLoading(true);
    try {
      const parsed = JSON.parse(json) as GuardrailRule[] | GuardrailsConfig;
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, guardrails: parsed }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Save failed");
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
            First-class rules evaluated before the model, before tools, and after responses (block / escalate / confirm / rewrite).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Guardrail rules (JSON)</Label>
            <Textarea
              rows={18}
              value={json}
              onChange={(e) => setJson(e.target.value)}
              className="font-mono text-xs"
            />
          </div>
          <p className="text-xs text-[var(--muted)]">
            Each rule: name, condition (always|keyword|topic|low_confidence|sensitive_action|human_request),
            scope (pre_model|pre_tool|post_model), action (allow|block|escalate|require_confirmation|rewrite),
            severity, message, pattern, approvalRequired
          </p>
          <Button onClick={save} disabled={loading}>
            {loading ? "Saving…" : "Save guardrails"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
