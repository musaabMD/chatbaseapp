import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { getAgentForWorkspace } from "@/lib/agents";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function TestsPage({
  params,
}: {
  params: Promise<{ agentId: string }>;
}) {
  const { agentId } = await params;
  const { workspace } = await requireWorkspace();
  const agent = await getAgentForWorkspace(agentId, workspace.id);
  if (!agent) notFound();

  const db = await getDb();
  const suites = await db
    .prepare(`SELECT * FROM test_suites WHERE agent_id = ? ORDER BY created_at DESC`)
    .bind(agentId)
    .all<{ id: string; name: string; created_at: string }>();

  const suiteList = suites.results || [];
  const casesBySuite: Record<string, Array<{ id: string; name: string; user_input: string }>> = {};

  for (const suite of suiteList) {
    const cases = await db
      .prepare(`SELECT id, name, user_input FROM test_cases WHERE suite_id = ?`)
      .bind(suite.id)
      .all<{ id: string; name: string; user_input: string }>();
    casesBySuite[suite.id] = cases.results || [];
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <p className="text-sm text-[var(--muted)]">
          Validate assistant responses against expected behaviors before publishing.
        </p>
        <Button variant="outline" disabled>Add suite (coming soon)</Button>
      </div>

      {suiteList.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No test suites</CardTitle>
            <CardDescription>
              Test suites help you regression-test admissions answers, escalation rules, and citation
              requirements.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-[var(--muted)]">
              Use the playground to manually test, then add automated suites in a future release.
            </p>
          </CardContent>
        </Card>
      ) : (
        suiteList.map((suite: { id: string; name: string; created_at: string }) => (
          <Card key={suite.id}>
            <CardHeader>
              <CardTitle>{suite.name}</CardTitle>
              <CardDescription>
                Created {new Date(suite.created_at).toLocaleDateString()}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {(casesBySuite[suite.id] || []).map((tc) => (
                <div
                  key={tc.id}
                  className="rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 text-sm"
                >
                  <div className="font-medium">{tc.name}</div>
                  <div className="text-[var(--muted)]">{tc.user_input}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
