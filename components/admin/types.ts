/** Shapes returned by GET /api/candidates (shared by the admin components). */
import type { Candidate } from "@/lib/sheets";

export type CandidateListItem = Omit<Candidate, "resume_text"> & { has_text: boolean };

export type JobSummary = { job_id: string; title_fa: string; min_score: number; is_open: boolean };

export type CandidatesResponse = {
  candidates: CandidateListItem[];
  jobs: JobSummary[];
  timezone: string;
};
