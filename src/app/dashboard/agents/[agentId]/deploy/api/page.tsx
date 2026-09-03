import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function ApiDeployPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const example = `curl -X POST https://app.campusly.ai/api/chat \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer YOUR_API_KEY" \\
  -d '{
    "agentId": "${agentId}",
    "message": "What are the admission requirements?",
    "channel": "api"
  }'`;

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Chat API</CardTitle>
          <CardDescription>
            Send messages to your assistant programmatically from your LMS, CRM, or mobile app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="text-sm font-medium">Endpoint</div>
            <code className="mt-1 block rounded-lg bg-[var(--secondary)]/60 px-3 py-2 text-sm">
              POST /api/chat
            </code>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Request body</div>
            <ul className="space-y-1 text-sm text-[var(--muted)]">
              <li><code>agentId</code> — assistant ID (required)</li>
              <li><code>message</code> — user message (required)</li>
              <li><code>conversationId</code> — continue an existing conversation</li>
              <li><code>channel</code> — e.g. api, widget, playground</li>
              <li><code>pageUrl</code>, <code>pageTitle</code> — page context</li>
            </ul>
          </div>
          <div>
            <div className="text-sm font-medium mb-2">Example</div>
            <pre className="overflow-x-auto rounded-xl bg-[var(--secondary)]/60 p-4 text-xs font-mono">
              {example}
            </pre>
          </div>
          <p className="text-sm text-[var(--muted)]">
            Create API keys in <a href="/dashboard/api" className="underline">Workspace API</a>.
            Public widget calls use <code>public: true</code> without an API key.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
