"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/input";

export function HelpdeskActions({
  conversationId,
  automationState,
  handoffStatus,
}: {
  conversationId: string;
  automationState?: string | null;
  handoffStatus?: string;
}) {
  const router = useRouter();
  const [reply, setReply] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function run(action: string, content?: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/helpdesk", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId, action, content }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Failed");
      toast.success(action === "reply" ? "Reply sent" : "Updated");
      if (action === "reply") setReply("");
      if (action === "note") setNote("");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 rounded-2xl border border-[var(--border)] bg-white/80 p-4">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("takeover")}>
          Take over
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("hold")}>
          On hold
        </Button>
        <Button size="sm" variant="outline" disabled={busy} onClick={() => void run("resolve")}>
          Resolve
        </Button>
        <span className="self-center text-xs text-[var(--muted)]">
          State: {automationState || handoffStatus || "auto"}
        </span>
      </div>

      <div className="space-y-2">
        <Textarea
          rows={3}
          placeholder="Reply as human agent…"
          value={reply}
          onChange={(e) => setReply(e.target.value)}
        />
        <Button size="sm" disabled={busy || !reply.trim()} onClick={() => void run("reply", reply)}>
          Send reply
        </Button>
      </div>

      <div className="space-y-2">
        <Textarea
          rows={2}
          placeholder="Internal note (not visible to customer)…"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
        <Button size="sm" variant="secondary" disabled={busy || !note.trim()} onClick={() => void run("note", note)}>
          Add note
        </Button>
      </div>
    </div>
  );
}
