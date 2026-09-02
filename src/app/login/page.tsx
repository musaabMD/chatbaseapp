"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: fd.get("email"),
        password: fd.get("password"),
      }),
    });
    const data = (await res.json()) as Record<string, unknown>;
    setLoading(false);
    if (!res.ok) {
      toast.error((typeof data.error === "string" ? data.error : undefined) || "Login failed");
      return;
    }
    router.push("/dashboard");
  }

  return (
    <main className="campus-grid flex min-h-screen items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="font-[family-name:var(--font-display)] text-2xl">Welcome back</CardTitle>
          <CardDescription>Log in to your Campusly workspace.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={onSubmit}>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input id="password" name="password" type="password" required />
            </div>
            <Button className="w-full" disabled={loading}>
              {loading ? "Signing in…" : "Log in"}
            </Button>
          </form>
          <p className="mt-4 text-center text-sm text-[var(--muted)]">
            New here? <Link href="/signup" className="text-[var(--primary)] underline">Create account</Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
