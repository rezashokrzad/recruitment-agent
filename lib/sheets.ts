/**
 * Tool: Google Sheets — the project's only database.
 *
 * Rules this module follows:
 *   • Columns are mapped by HEADER NAME (row 1), never by position, so you can
 *     reorder or add columns in the sheet without breaking the app.
 *   • Reads fetch whole tabs in one request (batchGet); updates to many cells
 *     go out in one batchUpdate. Google's quota is ~60 requests/minute.
 *   • Appends go through a single serial queue so concurrent uploads don't collide.
 *   • Values are written RAW so "09121234567" stays text instead of becoming a number.
 */
import { google, type sheets_v4 } from "googleapis";
import { DateTime } from "luxon";
import { getEnv } from "./env";
import { getGoogleAuth } from "./google-auth";
import { sheetAppendQueue } from "./queue";
import { singleton } from "./singleton";

// ─────────────────────────── Schema ───────────────────────────

export const CANDIDATE_HEADERS = [
  "id",
  "full_name",
  "email",
  "phone",
  "job_id",
  "resume_path",
  "original_filename",
  "resume_text",
  "status",
  "score",
  "rationale_fa",
  "matched_skills",
  "missing_requirements",
  "manager_note",
  "interview_start",
  "interview_end",
  "calendar_event_id",
  "invite_email_status",
  "rejection_email_status",
  "receipt_email_status",
  "error",
  "consent_at",
  "created_at",
  "updated_at",
] as const;

export const JOB_HEADERS = ["job_id", "title_fa", "description_fa", "min_score", "is_open"] as const;

export const LOG_HEADERS = [
  "timestamp",
  "candidate_id",
  "from_status",
  "to_status",
  "actor",
  "details",
] as const;

export const TAB_HEADERS = {
  candidates: CANDIDATE_HEADERS,
  jobs: JOB_HEADERS,
  log: LOG_HEADERS,
} as const;

export type Tab = keyof typeof TAB_HEADERS;

export type CandidateField = (typeof CANDIDATE_HEADERS)[number];
/** A candidate row exactly as stored: every cell is a string ("" when empty). */
export type Candidate = Record<CandidateField, string>;

export type Job = {
  job_id: string;
  title_fa: string;
  description_fa: string;
  min_score: number;
  is_open: boolean;
};

export type LogActor = "applicant" | "agent" | "manager" | "system";
export type LogEntry = {
  candidate_id: string;
  from_status: string;
  to_status: string;
  actor: LogActor;
  details: string;
};

// ─────────────────────────── Helpers ───────────────────────────

/** Current time as an ISO-8601 UTC string — the format of every timestamp in the sheet. */
export const nowIso = () => DateTime.utc().toISO();

/** Lists (skills, requirements) are stored in one cell separated by " | ". */
export const joinList = (items: string[]) => items.map((s) => s.trim()).filter(Boolean).join(" | ");
export const splitList = (cell: string) =>
  cell
    .split("|")
    .map((s) => s.trim())
    .filter(Boolean);

/** 0 → "A", 25 → "Z", 26 → "AA" … */
export function columnLetter(index: number): string {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  }
  return letter;
}

/** A1 range with the tab name quoted (tab names may contain spaces). */
const a1 = (tab: string, cells?: string) => (cells ? `'${tab}'!${cells}` : `'${tab}'`);

function api(): sheets_v4.Sheets {
  return singleton("sheetsApi", () => google.sheets({ version: "v4", auth: getGoogleAuth() }));
}

const spreadsheetId = () => getEnv().SHEET_ID;

// ─────────────────────────── Generic table access ───────────────────────────

type TableRow = { rowNumber: number; data: Record<string, string> };
type Table = { headers: string[]; rows: TableRow[] };

/** Turn the raw 2-D array of a tab into header-keyed objects. */
function toTable(tab: Tab, values: unknown[][]): Table {
  const headers = (values[0] ?? []).map((h) => String(h).trim());

  const missing = TAB_HEADERS[tab].filter((h) => !headers.includes(h));
  if (missing.length > 0) {
    throw new Error(
      `Sheet tab "${tab}" is missing column(s): ${missing.join(", ")}. Run "npm run seed" to create them.`,
    );
  }

  const rows: TableRow[] = [];
  values.slice(1).forEach((cells, i) => {
    if (!cells.some((c) => String(c ?? "").trim() !== "")) return; // skip blank rows
    const data: Record<string, string> = {};
    headers.forEach((header, col) => (data[header] = String(cells[col] ?? "")));
    rows.push({ rowNumber: i + 2, data }); // +1 for header, +1 because sheets are 1-based
  });

  return { headers, rows };
}

/** Read several whole tabs in ONE request. */
async function readTables<T extends Tab>(tabs: T[]): Promise<Record<T, Table>> {
  const res = await api().spreadsheets.values.batchGet({
    spreadsheetId: spreadsheetId(),
    ranges: tabs.map((tab) => a1(tab)),
  });
  const out = {} as Record<T, Table>;
  tabs.forEach((tab, i) => {
    const values = (res.data.valueRanges?.[i]?.values ?? []) as unknown[][];
    out[tab] = toTable(tab, values);
    headerCache.set(tab, { headers: out[tab].headers, at: Date.now() });
  });
  return out;
}

// Header row cache for appends (headers rarely change; refresh every minute).
const headerCache = singleton("headerCache", () => new Map<Tab, { headers: string[]; at: number }>());

async function getHeaders(tab: Tab): Promise<string[]> {
  const hit = headerCache.get(tab);
  if (hit && Date.now() - hit.at < 60_000) return hit.headers;
  const res = await api().spreadsheets.values.get({ spreadsheetId: spreadsheetId(), range: a1(tab, "1:1") });
  const headers = ((res.data.values?.[0] ?? []) as unknown[]).map((h) => String(h).trim());
  headerCache.set(tab, { headers, at: Date.now() });
  return headers;
}

/** Append rows (objects keyed by header). Serialized through the append queue. */
async function appendRows(tab: Tab, records: Record<string, string>[]): Promise<void> {
  if (records.length === 0) return;
  await sheetAppendQueue(async () => {
    const headers = await getHeaders(tab);
    const values = records.map((record) => headers.map((h) => record[h] ?? ""));
    await api().spreadsheets.values.append({
      spreadsheetId: spreadsheetId(),
      range: a1(tab, "A1"),
      valueInputOption: "RAW",
      insertDataOption: "INSERT_ROWS",
      requestBody: { values },
    });
  });
}

// ─────────────────────────── Candidates ───────────────────────────

function toCandidate(data: Record<string, string>): Candidate {
  const c = {} as Candidate;
  for (const h of CANDIDATE_HEADERS) c[h] = data[h] ?? "";
  return c;
}

export async function listCandidates(): Promise<Candidate[]> {
  const { candidates } = await readTables(["candidates"]);
  return candidates.rows.map((row) => toCandidate(row.data));
}

/** Candidates and jobs together, in a single Sheets request. */
export async function listCandidatesAndJobs(): Promise<{ candidates: Candidate[]; jobs: Job[] }> {
  const tables = await readTables(["candidates", "jobs"]);
  return {
    candidates: tables.candidates.rows.map((row) => toCandidate(row.data)),
    jobs: tables.jobs.rows.map((row) => toJob(row.data)),
  };
}

export async function getCandidate(id: string): Promise<Candidate | null> {
  const all = await listCandidates();
  return all.find((c) => c.id === id) ?? null;
}

type NewCandidate = Partial<Candidate> & Pick<Candidate, "id">;

export async function appendCandidates(candidates: NewCandidate[]) {
  const now = nowIso();
  await appendRows(
    "candidates",
    candidates.map((c) => ({ created_at: now, updated_at: now, ...c })),
  );
}

export async function appendCandidate(candidate: NewCandidate) {
  await appendCandidates([candidate]);
}

/**
 * Update several candidates in ONE batchUpdate. Only the given fields are
 * written; `updated_at` is always refreshed.
 */
export async function updateCandidates(
  updates: { id: string; patch: Partial<Candidate> }[],
): Promise<void> {
  if (updates.length === 0) return;
  const { candidates } = await readTables(["candidates"]);
  const now = nowIso();

  const data: sheets_v4.Schema$ValueRange[] = [];
  for (const { id, patch } of updates) {
    const row = candidates.rows.find((r) => r.data.id === id);
    if (!row) throw new Error(`Candidate ${id} not found in sheet`);

    for (const [field, value] of Object.entries({ ...patch, updated_at: now })) {
      const col = candidates.headers.indexOf(field);
      if (col === -1) throw new Error(`Unknown candidate column: ${field}`);
      data.push({ range: a1("candidates", `${columnLetter(col)}${row.rowNumber}`), values: [[value ?? ""]] });
    }
  }

  await api().spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { valueInputOption: "RAW", data },
  });
}

export async function updateCandidate(id: string, patch: Partial<Candidate>): Promise<void> {
  await updateCandidates([{ id, patch }]);
}

// ─────────────────────────── Jobs ───────────────────────────

function toJob(data: Record<string, string>): Job {
  return {
    job_id: data.job_id.trim(),
    title_fa: data.title_fa.trim(),
    description_fa: data.description_fa.trim(),
    min_score: Number(data.min_score) || 0,
    is_open: /^(true|1|yes|بله)$/i.test(data.is_open.trim()),
  };
}

export async function listJobs(): Promise<Job[]> {
  const { jobs } = await readTables(["jobs"]);
  return jobs.rows.map((row) => toJob(row.data));
}

/**
 * Short cache for the PUBLIC job list (/apply, /api/jobs). Without it every
 * page view is a Sheets read, and a burst of visitors (or a bot) can use up
 * the per-minute quota — which would also break the admin panel.
 * Pipeline steps (intake, screening, scheduling) always read fresh via getJob().
 */
const OPEN_JOBS_TTL_MS = 30_000;
const openJobsCache = singleton("openJobsCache", () => ({ jobs: null as Job[] | null, at: 0, pending: null as Promise<Job[]> | null }));

export async function listOpenJobs(): Promise<Job[]> {
  const cache = openJobsCache;
  if (cache.jobs && Date.now() - cache.at < OPEN_JOBS_TTL_MS) return cache.jobs;
  // Concurrent visitors share one in-flight request instead of each reading the sheet.
  cache.pending ??= listJobs()
    .then((jobs) => {
      cache.jobs = jobs.filter((job) => job.is_open);
      cache.at = Date.now();
      return cache.jobs;
    })
    .finally(() => {
      cache.pending = null;
    });
  return cache.pending;
}

export async function getJob(jobId: string): Promise<Job | null> {
  return (await listJobs()).find((job) => job.job_id === jobId) ?? null;
}

export async function appendJob(job: Job): Promise<void> {
  await appendRows("jobs", [
    { ...job, min_score: String(job.min_score), is_open: job.is_open ? "TRUE" : "FALSE" },
  ]);
  openJobsCache.at = 0; // show the new job right away
}

// ─────────────────────────── Log ───────────────────────────

export async function appendLog(entries: LogEntry[]): Promise<void> {
  const timestamp = nowIso();
  await appendRows(
    "log",
    entries.map((entry) => ({ timestamp, ...entry })),
  );
}

// ─────────────────────────── Setup (used by scripts/seed-sheet.ts) ───────────────────────────

/** Create any missing tabs, write the header row of each tab and style it. */
export async function ensureSchema(): Promise<void> {
  const tabs = Object.keys(TAB_HEADERS) as Tab[];
  const readSheetIds = async () => {
    const meta = await api().spreadsheets.get({ spreadsheetId: spreadsheetId(), fields: "sheets.properties" });
    return new Map(meta.data.sheets?.map((s) => [s.properties?.title ?? "", s.properties?.sheetId ?? 0]) ?? []);
  };

  let sheetIds = await readSheetIds();
  const toCreate = tabs.filter((tab) => !sheetIds.has(tab));
  if (toCreate.length > 0) {
    await api().spreadsheets.batchUpdate({
      spreadsheetId: spreadsheetId(),
      requestBody: { requests: toCreate.map((title) => ({ addSheet: { properties: { title } } })) },
    });
    sheetIds = await readSheetIds();
  }

  // Header styling lives in its own file to keep this one about data.
  const { formatTabRequests } = await import("./sheet-format");
  await api().spreadsheets.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: { requests: tabs.flatMap((tab) => formatTabRequests(tab, sheetIds.get(tab)!)) },
  });

  await api().spreadsheets.values.batchUpdate({
    spreadsheetId: spreadsheetId(),
    requestBody: {
      valueInputOption: "RAW",
      data: tabs.map((tab) => ({ range: a1(tab, "A1"), values: [[...TAB_HEADERS[tab]]] })),
    },
  });
  headerCache.clear();
}

/** Delete every data row (keeps headers). Used by `npm run seed -- --reset`. */
export async function clearData(tabs: Tab[]): Promise<void> {
  await api().spreadsheets.values.batchClear({
    spreadsheetId: spreadsheetId(),
    requestBody: { ranges: tabs.map((tab) => a1(tab, "A2:ZZ")) },
  });
}
