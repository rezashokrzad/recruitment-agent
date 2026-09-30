/**
 * GET /api/candidates (admin) — every candidate row, plus job titles and the
 * manager's timezone so the client can render Jalali dates correctly.
 *
 * `resume_text` is left out to keep the payload small; the drawer loads it
 * per candidate.
 */
import { requireAdmin } from "@/lib/auth";
import { getEnv } from "@/lib/env";
import { listCandidatesAndJobs } from "@/lib/sheets";

export async function GET(request: Request) {
  const denied = await requireAdmin(request);
  if (denied) return denied;

  try {
    const { candidates, jobs } = await listCandidatesAndJobs();
    return Response.json({
      candidates: candidates.map(({ resume_text, ...rest }) => ({ ...rest, has_text: resume_text.length > 0 })),
      jobs: jobs.map(({ job_id, title_fa, min_score, is_open }) => ({ job_id, title_fa, min_score, is_open })),
      timezone: getEnv().MANAGER_TIMEZONE,
    });
  } catch (err) {
    console.error("[api/candidates]", err);
    return Response.json(
      { error: "خواندن اطلاعات از Google Sheets ممکن نشد.", detail: (err as Error).message },
      { status: 500 },
    );
  }
}
