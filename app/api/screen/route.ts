/**
 * POST /api/screen (admin, or cron with the x-cron-secret header).
 *
 *   { "mode": "one" }  — screen the next new row and return how many remain
 *                        (the admin button loops this so it can show progress)
 *   { "mode": "all" }  — screen every new row in this request (the cron default)
 *   { "id": "..." }    — screen that one candidate
 */
import { z } from "zod";
import { actionErrorResponse } from "@/lib/action-request";
import { requireAdmin } from "@/lib/auth";
import { OrchestratorError, screenAllNew, screenCandidate, screenNext } from "@/lib/orchestrator";

const BodySchema = z.object({
  mode: z.enum(["one", "all"]).optional(),
  id: z.string().min(1).optional(),
});

export async function POST(request: Request) {
  const denied = await requireAdmin(request, { allowCron: true });
  if (denied) return denied;

  let mode: "one" | "all" = "all";
  let id: string | undefined;
  const text = await request.text();
  if (text.trim()) {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });
    }
    const parsed = BodySchema.safeParse(json);
    if (!parsed.success) return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });
    mode = parsed.data.mode ?? "all";
    id = parsed.data.id;
  }

  try {
    if (id) return Response.json({ processed: await screenCandidate(id) });
    if (mode === "one") return Response.json(await screenNext());
    return Response.json(await screenAllNew());
  } catch (err) {
    if (err instanceof OrchestratorError) return actionErrorResponse(err);
    console.error("[api/screen]", err);
    return Response.json({ error: "غربالگری با خطا مواجه شد." }, { status: 500 });
  }
}
