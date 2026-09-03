import { requireWorkspace } from "@/lib/auth";
import { listApiKeys } from "@/lib/auth/api-keys";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ApiKeysManager } from "@/components/dashboard/api-keys-manager";

export default async function ApiPage() {
  const { workspace } = await requireWorkspace();
  const keys = await listApiKeys(workspace.id);

  const example = `curl -X POST https://app.campusly.ai/api/chat \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"agentId": "agent_...", "message": "Hello"}'`;

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">API</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Manage API keys for programmatic access.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>API keys</CardTitle>
          <CardDescription>Keys are shown once at creation. Store them securely.</CardDescription>
        </CardHeader>
        <CardContent>
          <ApiKeysManager initialKeys={keys} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Quick start</CardTitle>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-xl bg-[var(--secondary)]/60 p-4 text-xs font-mono">
            {example}
          </pre>
        </CardContent>
      </Card>
    </div>
  );
}
