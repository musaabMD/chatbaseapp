"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function IntegrationConnectButton({
  type,
  connected,
}: {
  type: string;
  connected: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    try {
      const res = await fetch("/api/integrations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          action: connected ? "disconnect" : "connect_mock",
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(connected ? "Disconnected" : "Connected (mock)");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button size="sm" variant={connected ? "secondary" : "default"} disabled={busy} onClick={() => void toggle()}>
      {busy ? "…" : connected ? "Disconnect" : "Connect mock"}
    </Button>
  );
}
