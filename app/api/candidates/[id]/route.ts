/**
 * GET /api/candidates/[id] (admin) — one full candidate row, including the
 * extracted resume text, for the detail drawer.
 */
import { requireAdmin } from "@/lib/auth";
import { getCandidate } from "@/lib/sheets";

export async function GET(request: Request, { params }: RouteContext<"/api/candidates/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const candidate = await getCandidate(id);
  if (!candidate) return Response.json({ error: "متقاضی پیدا نشد." }, { status: 404 });
  return Response.json({ candidate });
}
