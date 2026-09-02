import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function AssistantPageDeploy({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const slug = agent.public_slug || agent.slug;
  const publicUrl = `/a/${slug}`;

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Hosted assistant page</CardTitle>
          <CardDescription>
            Share a standalone chat page — no website embed required.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="rounded-xl bg-[var(--secondary)]/60 px-4 py-3 font-mono text-sm">
            {publicUrl}
          </div>
          <div className="flex gap-2">
            <Link href={publicUrl} target="_blank">
              <Button>Open public page</Button>
            </Link>
            <Link href={`/dashboard/agents/${agentId}/deploy/widget`}>
              <Button variant="outline">Widget install</Button>
            </Link>
          </div>
          <p className="text-sm text-[var(--muted)]">
            The page is available when the assistant is published (status: active).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
