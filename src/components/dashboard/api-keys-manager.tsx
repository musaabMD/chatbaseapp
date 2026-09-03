"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type KeyRow = {
  id: string;
  name: string;
  key_prefix: string;
  last_used_at: string | null;
  created_at: string;
};

export function ApiKeysManager({ initialKeys }: { initialKeys: KeyRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("Default chat key");
  const [busy, setBusy] = useState(false);
  const [revealed, setRevealed] = useState<string | null>(null);

  async function createKey() {
    setBusy(true);
    setRevealed(null);
    try {
      const res = await fetch("/api/api-keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, scopes: ["chat"] }),
      });
      const data = (await res.json()) as { error?: string; key?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      setRevealed(data.key || null);
      toast.success("API key created — copy it now");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function revoke(keyId: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/api-keys", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keyId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Key revoked");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Key name"
          className="max-w-xs"
        />
        <Button disabled={busy || !name.trim()} onClick={() => void createKey()}>
          Create key
        </Button>
      </div>

      {revealed ? (
        <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">
          <div className="font-medium text-amber-950">Copy this key now — it won’t be shown again</div>
          <code className="mt-2 block break-all font-mono text-xs">{revealed}</code>
        </div>
      ) : null}

      {initialKeys.length === 0 ? (
        <p className="text-sm text-[var(--muted)]">No API keys yet.</p>
      ) : (
        <div className="space-y-2">
          {initialKeys.map((k) => (
            <div
              key={k.id}
              className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white/70 px-4 py-3"
            >
              <div>
                <div className="text-sm font-medium">{k.name}</div>
                <div className="font-mono text-xs text-[var(--muted)]">{k.key_prefix}…</div>
                <div className="text-[11px] text-[var(--muted)]">
                  {k.last_used_at ? `Last used ${new Date(k.last_used_at).toLocaleString()}` : "Never used"}
                </div>
              </div>
              <Button size="sm" variant="secondary" disabled={busy} onClick={() => void revoke(k.id)}>
                Revoke
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
