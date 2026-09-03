import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

const PLANS = [
  {
    id: "free",
    name: "Free",
    price: "$0",
    messages: "1,000 messages/mo",
    features: ["1 assistant", "Website widget", "Knowledge base"],
  },
  {
    id: "pro",
    name: "Pro",
    price: "$99",
    messages: "10,000 messages/mo",
    features: ["5 assistants", "API access", "Analytics", "Escalations"],
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: "Custom",
    messages: "Unlimited",
    features: ["SSO", "Custom models", "SLA", "Dedicated support"],
  },
];

export default async function BillingPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const subscription = await db
    .prepare(`SELECT * FROM subscriptions WHERE workspace_id = ?`)
    .bind(workspace.id)
    .first<{ plan: string; status: string; message_limit: number; current_period_end: string | null }>();

  const currentPlan = subscription?.plan || workspace.plan;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Billing</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Current plan: <span className="font-medium capitalize">{currentPlan}</span>
          {subscription?.current_period_end && (
            <> · Renews {new Date(subscription.current_period_end).toLocaleDateString()}</>
          )}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={plan.id === currentPlan ? "border-[var(--primary)] ring-1 ring-[var(--primary)]" : ""}
          >
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.messages}</CardDescription>
              <div className="font-[family-name:var(--font-display)] text-3xl font-semibold">
                {plan.price}
                {plan.price !== "Custom" && <span className="text-sm font-normal text-[var(--muted)]">/mo</span>}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <ul className="space-y-1 text-sm text-[var(--muted)]">
                {plan.features.map((f) => (
                  <li key={f}>✓ {f}</li>
                ))}
              </ul>
              {plan.id === currentPlan ? (
                <Button variant="secondary" disabled>Current plan</Button>
              ) : (
                <Button variant="outline" disabled>Upgrade (coming soon)</Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Link href="/dashboard/usage" className="text-sm text-[var(--primary)] hover:underline">
        View usage →
      </Link>
    </div>
  );
}
