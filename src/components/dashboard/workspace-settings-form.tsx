"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { safeJsonParse } from "@/lib/utils";

type WorkspaceSettingsProps = {
  workspaceId: string;
  initialName: string;
  initialInstitution: string;
  initialWebsite: string;
  initialDescription: string;
  initialBrandColors: string;
};

export function WorkspaceSettingsForm(props: WorkspaceSettingsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(props.initialName);
  const [institution, setInstitution] = useState(props.initialInstitution);
  const [website, setWebsite] = useState(props.initialWebsite);
  const [description, setDescription] = useState(props.initialDescription);
  const colors = safeJsonParse<{ primary?: string }>(props.initialBrandColors, {});
  const [primaryColor, setPrimaryColor] = useState(colors.primary || "#0C5C4C");

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          institutionName: institution,
          website,
          brandDescription: description,
          brandColors: { primary: primaryColor },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      toast.success("Workspace updated");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Save failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6 p-6 md:p-8">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight">
          Workspace settings
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Institution profile and branding defaults.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Institution</CardTitle>
          <CardDescription>Used in assistant instructions and hosted pages.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Workspace name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Institution name</Label>
            <Input value={institution} onChange={(e) => setInstitution(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
          </div>
          <div className="space-y-2">
            <Label>Brand description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Primary brand color</Label>
            <Input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </div>
          <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save workspace"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
