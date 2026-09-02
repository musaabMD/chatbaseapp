"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeJsonParse } from "@/lib/utils";

type Procedure = {
  id: string;
  name: string;
  description: string | null;
  trigger_text: string | null;
  steps: string;
};

export function ProceduresManager({ agentId }: { agentId: string }) {
  const [procedures, setProcedures] = useState<Procedure[]>([]);
  const [name, setName] = useState("");
  const [triggerText, setTriggerText] = useState("");
  const [steps, setSteps] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch(`/api/procedures?agentId=${agentId}`);
    const data = (await res.json()) as Record<string, unknown>;
    setProcedures((data.procedures as Procedure[]) || []);
  }, [agentId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !steps.trim()) return;
    setBusy(true);
    try {
      const stepList = steps
        .split("\n")
        .filter(Boolean)
        .map((line) => ({ instruction: line.trim() }));

      const res = await fetch("/api/procedures", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agentId,
          name: name.trim(),
          triggerText: triggerText.trim() || undefined,
          steps: stepList,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Failed");
      toast.success("Procedure created");
      setName("");
      setTriggerText("");
      setSteps("");
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
          <CardTitle>Procedures</CardTitle>
          <CardDescription>
            Multi-step workflows the assistant follows for complex requests.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {procedures.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No procedures yet.</p>
          ) : (
            procedures.map((p) => {
              const stepList = safeJsonParse<Array<{ instruction: string }>>(p.steps, []);
              return (
                <div
                  key={p.id}
                  className="rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3"
                >
                  <div className="font-medium">{p.name}</div>
                  {p.trigger_text && (
                    <div className="text-xs text-[var(--muted)]">Trigger: {p.trigger_text}</div>
                  )}
                  <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm">
                    {stepList.map((s, i) => (
                      <li key={i}>{s.instruction}</li>
                    ))}
                  </ol>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Create procedure</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="space-y-4">
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Application status check" />
            </div>
            <div className="space-y-2">
              <Label>Trigger phrase (optional)</Label>
              <Input
                value={triggerText}
                onChange={(e) => setTriggerText(e.target.value)}
                placeholder="check my application"
              />
            </div>
            <div className="space-y-2">
              <Label>Steps (one per line)</Label>
              <Textarea
                rows={5}
                value={steps}
                onChange={(e) => setSteps(e.target.value)}
                placeholder="Ask for student ID&#10;Verify identity&#10;Fetch status from SIS&#10;Summarize result"
              />
            </div>
            <Button type="submit" disabled={busy}>Create procedure</Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
