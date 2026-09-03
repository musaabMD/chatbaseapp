"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

export function GuestDemoButton({
  label = "Try demo — no sign-in",
  size = "lg",
  variant = "outline",
  className,
}: {
  label?: string;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function start() {
    setLoading(true);
    try {
      const res = await fetch("/api/auth/guest", { method: "POST" });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Failed");
      toast.success("Demo workspace ready");
      router.push(String(data.redirectTo || "/dashboard"));
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not start demo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      type="button"
      size={size}
      variant={variant}
      className={className}
      disabled={loading}
      onClick={() => void start()}
    >
      {loading ? "Opening demo…" : label}
    </Button>
  );
}
