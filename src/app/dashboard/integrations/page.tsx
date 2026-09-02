import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

const AVAILABLE = [
  { type: "slack", name: "Slack", description: "Route escalations to a Slack channel." },
  { type: "zendesk", name: "Zendesk", description: "Create tickets from escalated conversations." },
  { type: "hubspot", name: "HubSpot", description: "Sync leads and contacts to CRM." },
  { type: "canvas", name: "Canvas LMS", description: "Pull course catalog and enrollment data." },
  { type: "vercel", name: "Vercel", description: "Deploy and monitor your Campusly instance." },
];

export default async function IntegrationsPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const connected = await db
    .prepare(`SELECT * FROM integrations WHERE workspace_id = ?`)
    .bind(workspace.id)
    .all<{ type: string; name: string; status: string }>();

  const connectedMap = new Map<string, { type: string; name: string; status: string }>(
    (connected.results || []).map((i: { type: string; name: string; status: string }) => [i.type, i]),
  );

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Integrations
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Connect Campusly to your institution stack.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {AVAILABLE.map((item) => {
          const existing = connectedMap.get(item.type);
          return (
            <Card key={item.type}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{item.name}</CardTitle>
                  <Badge
                    className={
                      existing?.status === "connected" ? "bg-[var(--primary)] text-white" : undefined
                    }
                  >
                    {existing?.status || "not connected"}
                  </Badge>
                </div>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardContent>
                <button
                  type="button"
                  disabled
                  className="text-sm text-[var(--muted)]"
                >
                  Configure (coming soon)
                </button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
