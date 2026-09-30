/**
 * POST /api/candidates/[id]/retry (admin).
 * Screening error → new (then screen again). Scheduling error or no_slot → approved, then schedule again.
 */
import { actionErrorResponse, readManagerNote } from "@/lib/action-request";
import { requireAdmin } from "@/lib/auth";
import { retryCandidate } from "@/lib/orchestrator";

export async function POST(request: Request, { params }: RouteContext<"/api/candidates/[id]/retry">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const candidate = await retryCandidate(id, await readManagerNote(request));
    return Response.json({ candidate });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
