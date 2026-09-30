/**
 * POST /api/candidates/[id]/decline (admin).
 * candidate, unreadable, or rejected (confirming the AI suggestion) → declined.
 * A rejection email is sent only when SEND_REJECTION_EMAILS=true.
 */
import { actionErrorResponse, readManagerNote } from "@/lib/action-request";
import { requireAdmin } from "@/lib/auth";
import { declineCandidate } from "@/lib/orchestrator";

export async function POST(request: Request, { params }: RouteContext<"/api/candidates/[id]/decline">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const candidate = await declineCandidate(id, await readManagerNote(request));
    return Response.json({ candidate });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
