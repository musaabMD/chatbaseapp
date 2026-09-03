"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function AgentSettingsForm({
  agentId,
  initialName,
  initialDescription,
  initialAudience,
  initialLanguage,
}: {
  agentId: string;
  initialName: string;
  initialDescription: string;
  initialAudience: string;
  initialLanguage: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [audience, setAudience] = useState(initialAudience);
  const [language, setLanguage] = useState(initialLanguage);

  async function save() {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: agentId,
          name,
          description,
          audience,
          language,
        }),
      });
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) throw new Error((typeof data.error === "string" ? data.error : undefined) || "Save failed");
      toast.success("Settings saved");
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
          <CardTitle>General settings</CardTitle>
          <CardDescription>Basic assistant identity and audience.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Audience</Label>
              <Input value={audience} onChange={(e) => setAudience(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Language</Label>
              <Input value={language} onChange={(e) => setLanguage(e.target.value)} />
            </div>
          </div>
          <Button onClick={save} disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
        </CardContent>
      </Card>
    </div>
  );
}
