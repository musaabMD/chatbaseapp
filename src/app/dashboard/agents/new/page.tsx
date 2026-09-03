"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AGENT_USE_CASES } from "@/lib/agent/templates";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function NewAgentPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    name: "",
    useCase: "customer_support",
    description: "",
    language: "en",
    audience: "Customers",
  });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Name is required");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name.trim(),
          useCase: form.useCase,
          description: form.description || undefined,
          language: form.language,
          audience: form.audience || undefined,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Create failed");
      toast.success("Agent created");
      router.push(`/dashboard/agents/${String(data.id)}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Create failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Create agent
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Choose a use case—support, sales, ecommerce, education, and more—and we&apos;ll generate starter instructions.
        </p>
      </div>

      <form onSubmit={submit}>
        <Card>
          <CardHeader>
            <CardTitle>Agent details</CardTitle>
            <CardDescription>Name your agent and pick its primary role.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                placeholder="Support Agent"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>

            <div className="space-y-2">
              <Label>Use case</Label>
              <div className="grid max-h-[320px] gap-2 overflow-y-auto sm:grid-cols-2">
                {AGENT_USE_CASES.map((uc) => (
                  <button
                    key={uc.id}
                    type="button"
                    onClick={() =>
                      setForm({
                        ...form,
                        useCase: uc.id,
                        audience: uc.audienceDefault,
                      })
                    }
                    className={cn(
                      "rounded-xl border px-3 py-3 text-left text-sm transition-colors",
                      form.useCase === uc.id
                        ? "border-[var(--primary)] bg-[var(--secondary)]"
                        : "border-[var(--border)] bg-white/70 hover:bg-white",
                    )}
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {uc.category}
                    </div>
                    <div className="font-medium">{uc.title}</div>
                    <div className="mt-0.5 text-xs text-[var(--muted)]">{uc.description}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience">Primary audience</Label>
              <Input
                id="audience"
                value={form.audience}
                onChange={(e) => setForm({ ...form, audience: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                placeholder="Helps customers with orders, policies, and escalations."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
              />
            </div>

            <div className="flex gap-2 pt-2">
              <Button type="submit" disabled={loading}>
                {loading ? "Creating…" : "Create agent"}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
