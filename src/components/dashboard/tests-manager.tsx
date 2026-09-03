"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type Suite = { id: string; name: string; created_at: string };
type Simulation = { id: string; name: string; persona: string | null; initial_message: string };
type RunResult = { caseId?: string; status: string; notes: string; output?: string };

export function TestsManager({ agentId }: { agentId: string }) {
  const [suites, setSuites] = useState<Suite[]>([]);
  const [simulations, setSimulations] = useState<Simulation[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastRun, setLastRun] = useState<{ passed: number; failed: number; results: RunResult[] } | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/tests?agentId=${agentId}`);
    const data = (await res.json()) as { suites?: Suite[]; simulations?: Simulation[] };
    setSuites(data.suites || []);
    setSimulations(data.simulations || []);
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
      toast.success("Seeded common + edge-case suite and simulations");
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

  async function runSims() {
    setBusy(true);
    try {
      if (simulations.length === 0) {
        await fetch("/api/tests", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ agentId, action: "seed_simulations" }),
        });
        await load();
      }
      const res = await fetch("/api/tests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId, action: "run_all_simulations" }),
      });
      const data = (await res.json()) as {
        error?: string;
        passed?: number;
        failed?: number;
        results?: RunResult[];
      };
      if (!res.ok) throw new Error(data.error || "Simulation failed");
      setLastRun({
        passed: data.passed || 0,
        failed: data.failed || 0,
        results: data.results || [],
      });
      toast.success(`Simulations ${data.passed}/${(data.passed || 0) + (data.failed || 0)} passed`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Simulation failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-[var(--muted)]">
          Run common/edge cases and multi-turn simulations before publishing.
        </p>
        <div className="flex gap-2">
          <Button onClick={() => void seed()} disabled={busy} variant="secondary">
            Seed defaults
          </Button>
          <Button onClick={() => void runSims()} disabled={busy}>
            Run simulations
          </Button>
        </div>
      </div>

      {simulations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Simulations</CardTitle>
            <CardDescription>Persona-based multi-turn scenarios against the draft agent.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {simulations.map((s) => (
              <div key={s.id} className="rounded-xl border border-[var(--border)] p-3">
                <div className="font-medium">{s.name}</div>
                <div className="text-xs text-[var(--muted)]">
                  {s.persona || "Persona"} · “{s.initial_message.slice(0, 80)}”
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

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
                <CardDescription>Created {new Date(suite.created_at).toLocaleString()}</CardDescription>
              </div>
              <Button disabled={busy} onClick={() => void runSuite(suite.id)}>
                Run suite
              </Button>
            </CardHeader>
          </Card>
        ))
      )}

      {lastRun && (
        <Card>
          <CardHeader>
            <CardTitle>
              Results · {lastRun.passed} passed / {lastRun.failed} failed
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-xs">
            {lastRun.results.map((r, i) => (
              <div key={r.caseId || i} className="rounded-lg border border-[var(--border)] p-2">
                <div className="font-medium">{r.status}</div>
                {r.notes && <div className="text-[var(--muted)]">{r.notes}</div>}
                {r.output && <div className="mt-1 line-clamp-2">{r.output}</div>}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
