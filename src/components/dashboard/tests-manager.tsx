"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Suite = { id: string; name: string; created_at: string };
type Case = { id: string; name: string; user_input: string };
type RunResult = { caseId: string; status: string; notes: string; output: string };

export function TestsManager({ agentId }: { agentId: string }) {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [cases, setCases] = useState<Record<string, Case[]>>({});
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<{ passed: number; failed: number; results: RunResult[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tests?agentId=${agentId}`);
    const data = (await res.json()) as { suites?: Suite[] };
    setSuites(data.suites || []);
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function seed() {
    setBusy(true);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action: "seed_defaults" }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error(String(data.error || "Failed"));
      toast.success("Seeded common + edge-case suite");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function runSuite(suiteId: string) {
    setBusy(true);
    setLastRun(null);
    try {
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action: "run_suite", suiteId }),
      });
      const data = (await res.json()) as {
        error?: string;
        passed?: number;
        failed?: number;
        results?: RunResult[];
      };
      if (!res.ok) throw new Error(data.error || "Run failed");
      setLastRun({
        passed: data.passed || 0,
        failed: data.failed || 0,
        results: data.results || [],
      });
      toast.success(`Passed ${data.passed}/${(data.passed || 0) + (data.failed || 0)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Run common and edge-case scenarios before publishing an agent version.
        </p>
        <Button onClick={() => void seed()} disabled={busy}>
          Seed default suite
        </Button>
      </div>

      {suites.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No test suites</CardTitle>
            <CardDescription>
              Seed a suite with refund, order status, human escalation, and angry-customer cases.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        suites.map((suite) => (
          <Card key={suite.id}>
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle>{suite.name}</CardTitle>
                <CardDescription>Created {new Date(suite.created_at).toLocaleDateString()}</CardDescription>
              </div>
              <Button size="sm" disabled={busy} onClick={() => void runSuite(suite.id)}>
                {busy ? "Running…" : "Run suite"}
              </Button>
            </CardHeader>
            <CardContent className="text-sm text-[var(--muted)]">
              Suite id: <span className="font-mono text-xs">{suite.id}</span>
            </CardContent>
          </Card>
        ))
      )}

      {lastRun && (
        <Card>
          <CardHeader>
            <CardTitle>
              Last run — {lastRun.passed} passed, {lastRun.failed} failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {lastRun.results.map((r) => (
              <div key={r.caseId} className="rounded-xl border border-[var(--border)] p-3 text-sm">
                <div className="font-medium">
                  {r.status === "passed" ? "✓" : "✗"} {r.status}
                  {r.notes ? ` — ${r.notes}` : ""}
                </div>
                <div className="mt-1 text-xs text-[var(--muted)] line-clamp-3">{r.output}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
