/**
 * npm run test:google
 * Checks that the service account can (1) read the sheet and (2) query
 * free/busy on the manager's calendar for the next 7 days.
 */
import "./load-env";
import { google } from "googleapis";
import { DateTime } from "luxon";
import { getEnv } from "@/lib/env";
import { getGoogleAuth } from "@/lib/google-auth";
import { listCandidatesAndJobs } from "@/lib/sheets";

async function main() {
  const env = getEnv();
  console.log(`service account: ${env.GOOGLE_SERVICE_ACCOUNT_EMAIL}`);

  // 1) Sheets
  const { candidates, jobs } = await listCandidatesAndJobs();
  console.log(`✓ sheet: ${jobs.length} job(s) (${jobs.filter((j) => j.is_open).length} open), ${candidates.length} candidate(s)`);

  // 2) Calendar free/busy
  const calendar = google.calendar({ version: "v3", auth: getGoogleAuth() });
  const now = DateTime.now().setZone(env.MANAGER_TIMEZONE);
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: now.toISO()!,
      timeMax: now.plus({ days: 7 }).toISO()!,
      timeZone: env.MANAGER_TIMEZONE,
      items: [{ id: env.MANAGER_CALENDAR_ID }],
    },
  });

  const cal = res.data.calendars?.[env.MANAGER_CALENDAR_ID];
  if (cal?.errors?.length) {
    // freebusy doesn't throw on missing access — it reports it per calendar.
    throw new Error(
      `calendar "${env.MANAGER_CALENDAR_ID}": ${cal.errors.map((e) => e.reason).join(", ")} ` +
        `— share the calendar with the service account ("Make changes to events").`,
    );
  }

  const busy = cal?.busy ?? [];
  console.log(`✓ calendar: ${busy.length} busy interval(s) in the next 7 days`);
  for (const b of busy.slice(0, 10)) {
    const fmt = (iso: string) => DateTime.fromISO(iso).setZone(env.MANAGER_TIMEZONE).toFormat("ccc yyyy-LL-dd HH:mm");
    console.log(`   ${fmt(b.start!)} → ${fmt(b.end!)}`);
  }
}

main().catch((err) => {
  console.error("✗ Google test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
