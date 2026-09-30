/**
 * POST /api/candidates/[id]/approve (admin).
 * candidate → approved → scheduling → scheduled | no_slot | error.
 * Runs through the approval queue inside the orchestrator.
 */
import { actionErrorResponse, readManagerNote } from "@/lib/action-request";
import { requireAdmin } from "@/lib/auth";
import { approveCandidate } from "@/lib/orchestrator";

export async function POST(request: Request, { params }: RouteContext<"/api/candidates/[id]/approve">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const candidate = await approveCandidate(id, await readManagerNote(request));
    return Response.json({ candidate });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
