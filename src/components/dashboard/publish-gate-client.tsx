"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type VersionRow = {
  id: string;
  version: number;
  label: string | null;
  status: string;
  created_at: string;
};

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
  const [lastGate, setLastGate] = useState("");
  const [versions, setVersions] = useState<VersionRow[]>([]);

  async function loadVersions() {
    const res = await fetch(`/api/agents/publish?agentId=${agentId}`);
    const data = (await res.json()) as { versions?: VersionRow[] };
    setVersions(data.versions || []);
  }

  useEffect(() => {
    void loadVersions();
  }, [agentId]);

  async function publish(requirePassingTests: boolean) {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, requirePassingTests, action: "publish" }),
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
      await loadVersions();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Publish failed");
    } finally {
      setLoading(false);
    }
  }

  async function rollback(versionId: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/agents/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action: "rollback", versionId }),
      });
      const data = (await res.json()) as { error?: string; version?: number };
      if (!res.ok) throw new Error(data.error || "Rollback failed");
      toast.success(`Rolled back to v${data.version}`);
      await loadVersions();
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Rollback failed");
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
          suite exists. Production channels use the published snapshot; playground uses live draft.
        </p>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => publish(true)} disabled={loading}>
            {loading ? "Working…" : "Publish (run tests)"}
          </Button>
          <Button variant="secondary" onClick={() => publish(false)} disabled={loading}>
            Force publish
          </Button>
        </div>
        {lastGate && <p className="text-xs text-[var(--muted)]">{lastGate}</p>}

        {versions.length > 0 && (
          <div className="space-y-2 border-t border-[var(--border)] pt-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Versions</div>
            {versions.slice(0, 6).map((v) => (
              <div key={v.id} className="flex items-center justify-between gap-2 text-sm">
                <span>
                  v{v.version} {v.label ? `· ${v.label}` : ""}{" "}
                  {publishedVersionId === v.id ? <span className="text-[var(--primary)]">(live)</span> : null}
                </span>
                {publishedVersionId !== v.id && (
                  <Button size="sm" variant="outline" disabled={loading} onClick={() => void rollback(v.id)}>
                    Rollback
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
