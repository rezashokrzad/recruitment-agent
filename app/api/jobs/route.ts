/**
 * GET /api/jobs (public) — open jobs for the /apply dropdown.
 * Only id and title are exposed; descriptions and min_score stay private.
 */
import { listOpenJobs } from "@/lib/sheets";

export async function GET() {
  try {
    const jobs = await listOpenJobs();
    return Response.json({ jobs: jobs.map(({ job_id, title_fa }) => ({ job_id, title_fa })) });
  } catch (err) {
    console.error("[api/jobs]", err);
    return Response.json({ error: "دریافت فهرست موقعیت‌های شغلی ممکن نشد." }, { status: 500 });
  }
}
