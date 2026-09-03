import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";
import { SUPPORTED_CHANNELS } from "@/lib/agent/channels";

const AVAILABLE = [
  { type: "shopify", name: "Shopify", category: "Commerce", description: "Orders, products, and refunds." },
  { type: "stripe", name: "Stripe", category: "Commerce", description: "Subscriptions, invoices, and payments." },
  { type: "zendesk", name: "Zendesk", category: "Helpdesk", description: "Escalate conversations into tickets." },
  { type: "intercom", name: "Intercom", category: "Helpdesk", description: "Handoff with AI summary + transcript." },
  { type: "freshdesk", name: "Freshdesk", category: "Helpdesk", description: "Create and sync support tickets." },
  { type: "gorgias", name: "Gorgias", category: "Helpdesk", description: "Ecommerce helpdesk handoff." },
  { type: "helpscout", name: "Help Scout", category: "Helpdesk", description: "Shared inbox escalations." },
  { type: "hubspot", name: "HubSpot", category: "CRM", description: "Sync leads and contacts." },
  { type: "salesforce", name: "Salesforce", category: "CRM", description: "Cases and customer records." },
  { type: "slack", name: "Slack", category: "Comms", description: "Route escalations to a channel." },
  { type: "whatsapp", name: "WhatsApp", category: "Channels", description: "WhatsApp Business channel adapter." },
  { type: "email", name: "Email", category: "Channels", description: "Email thread channel adapter." },
  { type: "calendly", name: "Calendly", category: "Scheduling", description: "Demo and booking links." },
  { type: "custom_webhook", name: "Custom webhook", category: "Custom", description: "REST/webhook connector for internal APIs." },
];

export default async function IntegrationsPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const connected = await db
    .prepare(`SELECT * FROM integrations WHERE workspace_id = ?`)
    .bind(workspace.id)
    .all<{ type: string; name: string; status: string }>();

  const connectedMap = new Map(
    (connected.results || []).map((i) => [i.type, i]),
  );

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Prebuilt connectors and channel adapters. Custom HTTP actions cover anything without an official connector.
          OAuth credential vault wiring comes next — catalog + escalation adapters are ready.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Supported channels (runtime)</CardTitle>
          <CardDescription>
            One agent runtime — adapters normalize inbound events via <code>/api/channels/ingest</code>.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {SUPPORTED_CHANNELS.map((ch) => (
            <Badge key={ch}>{ch}</Badge>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {AVAILABLE.map((item) => {
          const existing = connectedMap.get(item.type);
          return (
            <Card key={item.type}>
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-[var(--muted)]">
                      {item.category}
                    </div>
                    <CardTitle className="text-base">{item.name}</CardTitle>
                  </div>
                  <Badge
                    className={
                      existing?.status === "connected" ? "bg-[var(--primary)] text-white" : undefined
                    }
                  >
                    {existing?.status || "available"}
                  </Badge>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-[var(--muted)]">
                  Adapter stub records outbound escalation events. Connect OAuth in a follow-up.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
