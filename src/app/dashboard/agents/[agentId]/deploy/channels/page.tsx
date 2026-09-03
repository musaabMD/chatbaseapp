import Link from "next/link";
import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getAgentForWorkspace } from "@/lib/agents";
import { getDb } from "@/lib/cloudflare";
import { createId, nowIso } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORTED_CHANNELS } from "@/lib/agent/channels";
import { ChannelDeliverySimulator } from "@/components/dashboard/channel-delivery-simulator";

export default async function DeployChannelsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const db = await getDb();
  const hooks = await db
    .prepare(`SELECT channel, verify_token, status, created_at FROM channel_webhooks WHERE agent_id = ?`)
    .bind(agentId)
    .all<{ channel: string; verify_token: string | null; status: string; created_at: string }>();

  // Ensure default webhook rows exist for omnichannel deploy docs
  const existing = new Set((hooks.results || []).map((h) => h.channel));
  for (const channel of ["whatsapp", "messenger", "instagram", "slack", "email", "voice"] as const) {
    if (!existing.has(channel)) {
      await db
        .prepare(
          `INSERT INTO channel_webhooks (id, workspace_id, agent_id, channel, verify_token, status, created_at)
           VALUES (?, ?, ?, ?, ?, 'active', ?)`,
        )
        .bind(createId("cwh"), workspace.id, agentId, channel, `verify_${agentId.slice(-8)}`, nowIso())
        .run();
    }
  }

  const refreshed = await db
    .prepare(`SELECT channel, verify_token, status FROM channel_webhooks WHERE agent_id = ? ORDER BY channel`)
    .bind(agentId)
    .all<{ channel: string; verify_token: string | null; status: string }>();

  const origin = process.env.NEXT_PUBLIC_APP_URL || "https://YOUR_DOMAIN";
  const embedSnippet = `<script src="${origin}/widget.js" data-agent-id="${agentId}" data-channel="in_app" async></script>`;

  return (
    <div className="space-y-6 p-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold">Channels</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Build once, deploy everywhere. One agent runtime — adapters per channel.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Supported surfaces</CardTitle>
          <CardDescription>Shared instructions, knowledge, procedures, and actions across all channels.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2 text-sm">
          {SUPPORTED_CHANNELS.map((c) => (
            <span key={c} className="rounded-lg bg-[var(--secondary)] px-2.5 py-1">
              {c}
            </span>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>In-app embed</CardTitle>
          <CardDescription>Drop this snippet into your product shell for authenticated in-app chat.</CardDescription>
        </CardHeader>
        <CardContent>
          <pre className="overflow-x-auto rounded-xl bg-[var(--secondary)]/70 p-3 text-xs">{embedSnippet}</pre>
        </CardContent>
      </Card>

      <ChannelDeliverySimulator />

      <Card>
        <CardHeader>
          <CardTitle>Webhook endpoints</CardTitle>
          <CardDescription>
            POST inbound events with <code className="text-xs">workspaceId</code>, <code className="text-xs">agentId</code>, and{" "}
            <code className="text-xs">text</code>. Signature headers are required when a signing secret is set.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {(refreshed.results || []).map((h) => (
            <div key={h.channel} className="rounded-xl border border-[var(--border)] p-3">
              <div className="font-medium">{h.channel}</div>
              <code className="mt-1 block break-all text-xs text-[var(--muted)]">
                {origin}/api/channels/webhooks/{h.channel}
              </code>
              {h.verify_token && (
                <div className="mt-1 text-xs text-[var(--muted)]">verify_token: {h.verify_token}</div>
              )}
            </div>
          ))}
          <Link href={`/dashboard/agents/${agentId}/deploy/widget`} className="text-[var(--primary)] hover:underline">
            Website widget install →
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
