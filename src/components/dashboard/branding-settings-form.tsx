"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeJsonParse } from "@/lib/utils";

type BrandingConfig = {
  primaryColor?: string;
  logoUrl?: string;
  headerTitle?: string;
  avatarUrl?: string;
};

export function BrandingSettingsForm({
  agentId,
  initialBranding,
  initialAvatarUrl,
}: {
  agentId: string;
  initialBranding: BrandingConfig;
  initialAvatarUrl: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState<BrandingConfig>(initialBranding);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agentId,
          branding,
          avatar_url: avatarUrl || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Branding saved");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6">
      <Card>
        <CardHeader>
          <CardTitle>Branding</CardTitle>
          <CardDescription>Customize colors and appearance for widget and hosted page.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Primary color</Label>
            <Input
              type="color"
              value={branding.primaryColor || "#0C5C4C"}
              onChange={(e) => setBranding({ ...branding, primaryColor: e.target.value })}
            />
          </div>
          <div className="space-y-2">
            <Label>Header title</Label>
            <Input
              value={branding.headerTitle || ""}
              onChange={(e) => setBranding({ ...branding, headerTitle: e.target.value })}
              placeholder="Admissions Assistant"
            />
          </div>
          <div className="space-y-2">
            <Label>Logo URL</Label>
            <Input
              value={branding.logoUrl || ""}
              onChange={(e) => setBranding({ ...branding, logoUrl: e.target.value })}
              placeholder="https://..."
            />
          </div>
          <div className="space-y-2">
            <Label>Avatar URL</Label>
            <Input
              value={avatarUrl}
              onChange={(e) => setAvatarUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
          <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save branding"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function parseBranding(raw: string | null): BrandingConfig {
  return safeJsonParse<BrandingConfig>(raw, { primaryColor: "#0C5C4C" });
}
