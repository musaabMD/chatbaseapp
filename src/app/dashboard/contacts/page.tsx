import Link from "next/link";
import { requireWorkspace } from "@/lib/auth";
import { getDb } from "@/lib/cloudflare";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/card";

export default async function ContactsPage() {
  const { workspace } = await requireWorkspace();
  const db = await getDb();

  const result = await db
    .prepare(
      `SELECT id, name, email, type, program_interest, conversation_count, last_seen_at, created_at
       FROM contacts WHERE workspace_id = ?
       ORDER BY last_seen_at DESC, created_at DESC
       LIMIT 100`,
    )
    .bind(workspace.id)
    .all<{
      id: string;
      name: string | null;
      email: string | null;
      type: string;
      program_interest: string | null;
      conversation_count: number;
      last_seen_at: string | null;
      created_at: string;
    }>();

  const contacts = result.results || [];

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">Contacts</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Students, applicants, and leads from conversations.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All contacts</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {contacts.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">No contacts yet.</p>
          ) : (
            contacts.map((c: {
              id: string;
              name: string | null;
              email: string | null;
              type: string;
              program_interest: string | null;
              conversation_count: number;
            }) => (
              <Link
                key={c.id}
                href={`/dashboard/contacts/${c.id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3 hover:bg-white"
              >
                <div>
                  <div className="text-sm font-medium">{c.name || c.email || "Anonymous"}</div>
                  <div className="text-xs text-[var(--muted)]">
                    {c.email || "No email"} · {c.conversation_count} conversations
                    {c.program_interest && ` · ${c.program_interest}`}
                  </div>
                </div>
                <Badge>{c.type}</Badge>
              </Link>
            ))
          )}
        </CardContent>
      </Card>

      <Link href="/dashboard/inbox" className="text-sm text-[var(--primary)] hover:underline">
        View conversations →
      </Link>
    </div>
  );
}
