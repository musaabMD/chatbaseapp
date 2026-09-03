"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AGENT_USE_CASES } from "@/lib/agent/templates";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [brandPreview, setBrandPreview] = useState<{
    title?: string | null;
    description?: string | null;
    colors?: Array<{ hex: string }>;
  } | null>(null);
  const [form, setForm] = useState({
    useCase: "customer_support",
    workspaceName: "",
    institutionName: "",
    website: "",
    teamSize: "11-50",
    role: "Support",
    agentName: "",
    audience: "Customers",
    language: "en",
  });

  const steps = useMemo(
    () => ["Welcome", "Use case", "Organization", "Agent", "Launch"],
    [],
  );

  async function finish() {
    setLoading(true);
    const res = await fetch("/api/onboarding", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(form),
    });
    const data = (await res.json()) as Record<string, unknown>;
    setLoading(false);
    if (!res.ok) {
      toast.error((typeof data.error === "string" ? data.error : undefined) || "Onboarding failed");
      return;
    }
    setBrandPreview(data.brand as typeof brandPreview);
    toast.success("Workspace ready");
    router.push(`/dashboard/agents/${String(data.agentId)}/sources?onboarding=1`);
  }

  return (
    <main className="campus-grid min-h-screen px-6 py-10">
      <div className="mx-auto w-full max-w-3xl">
        <div className="mb-8">
          <div className="font-[family-name:var(--font-display)] text-3xl font-semibold">Campusly</div>
          <div className="mt-2 flex gap-2">
            {steps.map((label, i) => (
              <div
                key={label}
                className={cn(
                  "h-1.5 flex-1 rounded-full",
                  i <= step ? "bg-[var(--primary)]" : "bg-[var(--border)]",
                )}
              />
            ))}
          </div>
        </div>

        {step === 0 && (
          <Card className="fade-up">
            <CardHeader>
              <CardTitle className="font-[family-name:var(--font-display)] text-3xl">
                Build your AI customer agent
              </CardTitle>
              <CardDescription>
                Train an agent on your knowledge, procedures, and tools—then deploy it for support, sales, ecommerce, education, and more.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button size="lg" onClick={() => setStep(1)}>
                Create agent
              </Button>
            </CardContent>
          </Card>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold">
              What will your agent help with?
            </h1>
            <div className="grid gap-3 sm:grid-cols-2">
              {AGENT_USE_CASES.map((item) => (
                <button
                  key={item.id}
                  onClick={() => {
                    setForm((f) => ({
                      ...f,
                      useCase: item.id,
                      agentName: f.agentName || item.title,
                      audience: item.audienceDefault,
                      role: item.category === "education" ? "Admissions" : "Support",
                    }));
                    setStep(2);
                  }}
                  className={cn(
                    "rounded-2xl border border-[var(--border)] bg-white/75 p-4 text-left transition hover:border-[var(--primary)]",
                    form.useCase === item.id && "ring-2 ring-[var(--primary)]",
                  )}
                >
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                    {item.category}
                  </div>
                  <div className="font-medium">{item.title}</div>
                  <div className="mt-1 text-sm text-[var(--muted)]">{item.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 2 && (
          <Card>
            <CardHeader>
              <CardTitle>Organization details</CardTitle>
              <CardDescription>We&apos;ll use your website to pre-fill branding and knowledge discovery.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Workspace name</Label>
                <Input
                  value={form.workspaceName}
                  onChange={(e) => setForm({ ...form, workspaceName: e.target.value })}
                  placeholder="Acme Support"
                />
              </div>
              <div className="space-y-2">
                <Label>Organization / brand name</Label>
                <Input
                  value={form.institutionName}
                  onChange={(e) => setForm({ ...form, institutionName: e.target.value })}
                  placeholder="Acme Customer Co"
                />
              </div>
              <div className="space-y-2">
                <Label>Website</Label>
                <Input
                  value={form.website}
                  onChange={(e) => setForm({ ...form, website: e.target.value })}
                  placeholder="acme.com"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>Team size</Label>
                  <Input value={form.teamSize} onChange={(e) => setForm({ ...form, teamSize: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Your role</Label>
                  <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
                <Button onClick={() => setStep(3)}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 3 && (
          <Card>
            <CardHeader>
              <CardTitle>Create your first agent</CardTitle>
              <CardDescription>We&apos;ll generate starter instructions for your use case.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>Agent name</Label>
                <Input
                  value={form.agentName}
                  onChange={(e) => setForm({ ...form, agentName: e.target.value })}
                  placeholder="Acme Support Agent"
                />
              </div>
              <div className="space-y-2">
                <Label>Target audience</Label>
                <Input
                  value={form.audience}
                  onChange={(e) => setForm({ ...form, audience: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>Primary language</Label>
                <Input
                  value={form.language}
                  onChange={(e) => setForm({ ...form, language: e.target.value })}
                />
              </div>
              {brandPreview && (
                <div className="rounded-xl bg-[var(--secondary)]/70 p-3 text-sm">
                  We found your company: <strong>{brandPreview.title}</strong>
                  <div className="mt-1 text-[var(--muted)]">{brandPreview.description}</div>
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(2)}>Back</Button>
                <Button onClick={() => setStep(4)}>Continue</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === 4 && (
          <Card>
            <CardHeader>
              <CardTitle>Ready to launch setup</CardTitle>
              <CardDescription>
                Next you&apos;ll add knowledge, tune behavior, test in the playground, and install the widget.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                readOnly
                value={`Agent: ${form.agentName}\nOrganization: ${form.institutionName}\nWebsite: ${form.website || "—"}\nUse case: ${form.useCase}`}
              />
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setStep(3)}>Back</Button>
                <Button disabled={loading || !form.workspaceName || !form.institutionName || !form.agentName} onClick={finish}>
                  {loading ? "Creating…" : "Create workspace & agent"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </main>
  );
}
