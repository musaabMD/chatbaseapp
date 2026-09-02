"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function AgentStatusActions({
  agentId,
  status,
}: {
  agentId: string;
  status: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function updateStatus(newStatus: string) {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agentId, status: newStatus }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Update failed");
      toast.success(newStatus === "active" ? "Assistant published" : "Assistant paused");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Update failed");
    } finally {
      setLoading(false);
    }
  }

  if (status === "active") {
    return (
      <Button variant="outline" disabled={loading} onClick={() => updateStatus("paused")}>
        Pause assistant
      </Button>
    );
  }

  return (
    <Button disabled={loading} onClick={() => updateStatus("active")}>
      Publish assistant
    </Button>
  );
}
