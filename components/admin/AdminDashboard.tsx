"use client";

import { LogOut, RefreshCw, Search, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toFaDigits, toLatinDigits } from "@/lib/format";
import { STATUS_FILTERS, type Status } from "@/lib/status";
import { CandidateDrawer } from "./CandidateDrawer";
import { CandidatesTable } from "./CandidatesTable";
import { StatusTabs } from "./StatusTabs";
import type { CandidateListItem, CandidatesResponse } from "./types";

/** /admin: loads candidates from the sheet (via the API) and shows them in a filterable table. */
export function AdminDashboard() {
  const router = useRouter();
  const [data, setData] = useState<CandidatesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [screening, setScreening] = useState(false);
  const [screenLabel, setScreenLabel] = useState("");
  const closeDrawer = useCallback(() => setSelectedId(null), []);

  const patchCandidate = useCallback((id: string, patch: Partial<CandidateListItem>) => {
    setData((current) =>
      current && {
        ...current,
        candidates: current.candidates.map((row) => (row.id === id ? { ...row, ...patch } : row)),
      },
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await fetch("/api/candidates", { cache: "no-store" });
      const body = await res.json();
      if (res.status === 401) return router.replace("/login?next=/admin");
      if (!res.ok) throw new Error(body.detail ? `${body.error} (${body.detail})` : body.error);
      setData(body);
    } catch (err) {
      const message = (err as Error).message || "خطای ناشناخته";
      setLoadError(message);
      toast.error("بارگذاری فهرست متقاضیان ناموفق بود.");
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    // Initial fetch on mount; `load` only sets state after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const jobTitles = useMemo(
    () => Object.fromEntries((data?.jobs ?? []).map((j) => [j.job_id, j.title_fa])),
    [data],
  );

  // Newest first, then text search (Farsi or Latin digits both match).
  const searched = useMemo(() => {
    const q = toLatinDigits(query.trim().toLowerCase());
    return [...(data?.candidates ?? [])]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .filter(
        (c) =>
          !q ||
          [c.full_name, c.email, c.phone, jobTitles[c.job_id] ?? ""].some((field) =>
            toLatinDigits(field.toLowerCase()).includes(q),
          ),
      );
  }, [data, query, jobTitles]);

  const counts = useMemo(() => {
    const result: Record<string, number> = {};
    for (const f of STATUS_FILTERS) {
      result[f.key] = f.statuses
        ? searched.filter((c) => f.statuses!.includes(c.status as Status)).length
        : searched.length;
    }
    return result;
  }, [searched]);

  const visible = useMemo(() => {
    const statuses = STATUS_FILTERS.find((f) => f.key === filter)?.statuses;
    return statuses ? searched.filter((c) => statuses.includes(c.status as Status)) : searched;
  }, [searched, filter]);

  async function logout() {
    await fetch("/api/login", { method: "DELETE" });
    router.replace("/login");
  }

  async function runScreening() {
    setScreening(true);
    let done = 0;
    try {
      for (;;) {
        const res = await fetch("/api/screen", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ mode: "one" }),
        });
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || "غربالگری ناموفق بود.");
        if (!body.processed) {
          toast.message(done === 0 ? "متقاضی جدیدی برای غربالگری نیست." : `غربالگری ${toFaDigits(done)} متقاضی انجام شد.`);
          break;
        }
        done += 1;
        const name = body.processed.full_name || "متقاضی";
        setScreenLabel(
          body.remaining > 0
            ? `${name} — ${toFaDigits(body.remaining)} نفر باقی مانده`
            : name,
        );
        if (body.remaining === 0) {
          toast.success(`غربالگری ${toFaDigits(done)} متقاضی انجام شد.`);
          break;
        }
      }
      await load();
    } catch (err) {
      toast.error((err as Error).message);
      await load();
    } finally {
      setScreening(false);
      setScreenLabel("");
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">متقاضیان</h1>
          <p className="text-sm text-muted">فهرست رزومه‌های دریافتی و وضعیت هر متقاضی</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="primary" size="sm" onClick={runScreening} disabled={screening || loading}>
            <Sparkles className="size-4" />
            {screening ? "در حال غربالگری…" : "اجرای غربالگری"}
          </Button>
          <Button variant="secondary" size="sm" onClick={load} disabled={loading || screening}>
            <RefreshCw className={loading ? "size-4 animate-spin" : "size-4"} />
            به‌روزرسانی
          </Button>
          <Button variant="ghost" size="sm" onClick={logout}>
            <LogOut className="size-4" />
            خروج
          </Button>
        </div>
      </header>

      {screenLabel && (
        <p className="mb-3 text-sm text-muted" role="status">
          در حال غربالگری {screenLabel}
        </p>
      )}

      <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <StatusTabs active={filter} counts={counts} onChange={setFilter} />
        <div className="relative w-full lg:w-72">
          <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto size-4 text-subtle" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی نام، ایمیل، تلفن…"
            className="ps-9"
            aria-label="جستجو"
          />
        </div>
      </div>

      {loadError && !loading ? (
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-6 text-sm text-danger">
          <p className="font-medium">خواندن اطلاعات ممکن نشد.</p>
          <p className="mt-1 break-words text-danger/80">{loadError}</p>
          <Button variant="secondary" size="sm" className="mt-4" onClick={load}>
            تلاش دوباره
          </Button>
        </div>
      ) : (
        <CandidatesTable
          rows={visible}
          jobTitles={jobTitles}
          timezone={data?.timezone ?? "Asia/Tehran"}
          loading={loading && !data}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      )}

      <CandidateDrawer
        candidateId={selectedId}
        jobTitle={(id) => jobTitles[id] ?? id}
        timezone={data?.timezone ?? "Asia/Tehran"}
        onClose={closeDrawer}
        onPatch={patchCandidate}
      />
    </div>
  );
}
