"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function PlanSwitchButton({
  planId,
  current,
}: {
  planId: "free" | "pro" | "enterprise";
  current: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  if (current) {
    return (
      <Button variant="secondary" disabled>
        Current plan
      </Button>
    );
  }

  async function switchPlan() {
    setBusy(true);
    try {
      const res = await fetch("/api/billing/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = (await res.json()) as { error?: string; plan?: string };
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success(`Switched to ${data.plan} (local)`);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" disabled={busy} onClick={() => void switchPlan()}>
      {busy ? "…" : planId === "free" ? "Downgrade (local)" : "Upgrade (local)"}
    </Button>
  );
}
