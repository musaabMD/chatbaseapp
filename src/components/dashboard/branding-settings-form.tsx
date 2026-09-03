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
  welcomeMessage?: string;
  position?: string;
};

export function BrandingSettingsForm({
  agentId,
  initialBranding,
  initialAvatarUrl,
  initialBrandVoice,
}: {
  agentId: string;
  initialBranding: BrandingConfig;
  initialAvatarUrl: string;
  initialBrandVoice: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [branding, setBranding] = useState<BrandingConfig>(initialBranding);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice);

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
          brand_voice: brandVoice || null,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Save failed");
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
          <CardDescription>Visual appearance for widget and hosted page.</CardDescription>
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
              placeholder="Support Assistant"
            />
          </div>
          <div className="space-y-2">
            <Label>Welcome message</Label>
            <Input
              value={branding.welcomeMessage || ""}
              onChange={(e) => setBranding({ ...branding, welcomeMessage: e.target.value })}
              placeholder="Hi! How can I help you today?"
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
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Brand voice</CardTitle>
          <CardDescription>
            How the agent should sound — separate from operational instructions and knowledge.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <textarea
            className="min-h-32 w-full rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={brandVoice}
            onChange={(e) => setBrandVoice(e.target.value)}
            placeholder="Warm, concise, and professional. Prefer plain language. Never use slang or emoji."
          />
          <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save branding & voice"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function parseBranding(raw: string | null): BrandingConfig {
  return safeJsonParse<BrandingConfig>(raw, { primaryColor: "#0C5C4C" });
}
