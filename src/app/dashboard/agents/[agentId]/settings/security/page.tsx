import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function SecuritySettingsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
          <CardDescription>
            Domain allowlists, guardrails, and access controls for this assistant.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 text-sm">
            <div className="font-medium">Knowledge mode</div>
            <div className="text-[var(--muted)]">{agent.knowledge_mode} — controls how strictly the assistant uses institutional sources.</div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/agents/${agentId}/guardrails`}>
              <Button variant="outline">Edit guardrails</Button>
            </Link>
            <Link href={`/dashboard/agents/${agentId}/deploy/widget`}>
              <Button variant="outline">Domain allowlist</Button>
            </Link>
            <Link href="/dashboard/api">
              <Button variant="outline">API keys</Button>
            </Link>
          </div>
          <p className="text-xs text-[var(--muted)]">
            PII filtering and escalation rules are configured in Guardrails. Widget domains are managed on the Website widget deploy page.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
