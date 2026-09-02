import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function AgentsPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();
  const result = await db
    .prepare(`SELECT * FROM agents WHERE workspace_id = ? ORDER BY updated_at DESC`)
    .bind(workspace.id)
    .all<{
      id: string;
      name: string;
      description: string | null;
      use_case: string;
      status: string;
      updated_at: string;
    }>();

  const agents = result.results || [];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
            Assistants
          </h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Build, train, and deploy education AI assistants for your institution.
          </p>
        </div>
        <Link href="/dashboard/agents/new">
          <Button>Create assistant</Button>
        </Link>
      </div>

      {agents.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No assistants yet</CardTitle>
            <CardDescription>
              Create your first assistant to answer admissions, tuition, and student support questions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link href="/dashboard/agents/new">
              <Button>Create assistant</Button>
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {agents.map((agent: {
            id: string;
            name: string;
            description: string | null;
            use_case: string;
            status: string;
            updated_at: string;
          }) => (
            <Link key={agent.id} href={`/dashboard/agents/${agent.id}`}>
              <Card className="h-full transition-shadow hover:shadow-md">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <CardTitle className="text-base">{agent.name}</CardTitle>
                    <Badge
                      className={
                        agent.status === "active"
                          ? "bg-[var(--primary)] text-white"
                          : undefined
                      }
                    >
                      {agent.status}
                    </Badge>
                  </div>
                  <CardDescription className="line-clamp-2">
                    {agent.description || agent.use_case.replace(/_/g, " ")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-xs text-[var(--muted)]">
                    Updated {new Date(agent.updated_at).toLocaleDateString()}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
