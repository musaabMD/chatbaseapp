"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function PublishGateClient({
  agentId,
  status,
  publishedVersionId,
}: {
  agentId: string;
  status: string;
  publishedVersionId: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lastGate, setLastGate] = useState<string>("");

  async function publish(requirePassingTests: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, requirePassingTests }),
      });
      const data = (await res.json()) as {
        error?: string;
        version?: number;
        gate?: { passed: number; failed: number; total: number; notes?: string };
      };
      if (!res.ok) throw new Error(data.error || "Publish failed");
      if (data.gate) {
        setLastGate(
          `Gate: ${data.gate.passed}/${data.gate.total} passed${data.gate.notes ? ` — ${data.gate.notes}` : ""}`,
        );
      }
      toast.success(`Published v${data.version}`);
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Draft → production</CardTitle>
        <CardDescription>
          Current status: <strong>{status}</strong>
          {publishedVersionId ? ` · live ${publishedVersionId.slice(0, 12)}…` : " · no published version"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--muted)]">
          Publish snapshots instructions, model, guardrails, branding, and brand voice. Regression tests run first when a
          suite exists.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => publish(true)} disabled={loading}>
            {loading ? "Publishing…" : "Publish (run tests)"}
          </Button>
          <Button variant="secondary" onClick={() => publish(false)} disabled={loading}>
            Force publish
          </Button>
        </div>
        {lastGate && <p className="text-xs text-[var(--muted)]">{lastGate}</p>}
      </CardContent>
    </Card>
  );
}
