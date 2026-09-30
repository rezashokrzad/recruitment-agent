/**
 * POST /api/candidates/[id]/override (admin).
 * rejected or unreadable → candidate. Does not send email.
 */
import { actionErrorResponse, readManagerNote } from "@/lib/action-request";
import { requireAdmin } from "@/lib/auth";
import { overrideCandidate } from "@/lib/orchestrator";

export async function POST(request: Request, { params }: RouteContext<"/api/candidates/[id]/override">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;
  const { id } = await params;
  try {
    const candidate = await overrideCandidate(id, await readManagerNote(request));
    return Response.json({ candidate });
  } catch (err) {
    return actionErrorResponse(err);
  }
}
