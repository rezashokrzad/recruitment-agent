"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({ next }: { next: string }) {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setLoading(false);

    if (res?.ok) {
      router.replace(next);
      router.refresh();
    } else {
      const body = await res?.json().catch(() => null);
      setError(body?.error ?? "ارتباط با سرور برقرار نشد.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="password" className="text-sm font-medium">
          رمز عبور
        </label>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          autoFocus
          dir="ltr"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          aria-invalid={error ? true : undefined}
        />
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <Button type="submit" className="w-full" disabled={loading || !password}>
        {loading && <Loader2 className="size-4 animate-spin" />}
        ورود
      </Button>
    </form>
  );
}
