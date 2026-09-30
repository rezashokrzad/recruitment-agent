/**
 * GET /api/resumes/[id] (admin) — streams a candidate's PDF for the drawer's viewer.
 *
 * The file path is looked up in the sheet by candidate id. The client never
 * sends a path, so it can't ask for arbitrary files on the server.
 */
import { requireAdmin } from "@/lib/auth";
import { getCandidate } from "@/lib/sheets";
import { openResume } from "@/lib/storage";

export async function GET(request: Request, { params }: RouteContext<"/api/resumes/[id]">) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  const { id } = await params;
  const candidate = await getCandidate(id);
  if (!candidate?.resume_path) return Response.json({ error: "فایل رزومه‌ای برای این متقاضی وجود ندارد." }, { status: 404 });

  const file = await openResume(candidate.resume_path);
  if (!file) return Response.json({ error: "فایل رزومه روی سرور پیدا نشد." }, { status: 404 });

  // RFC 5987 filename* so Farsi filenames survive.
  const filename = encodeURIComponent(candidate.original_filename || `${id}.pdf`);
  return new Response(file.stream, {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(file.size),
      "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
