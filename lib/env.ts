/**
 * Environment variables — validated once with zod.
 *
 * Every other module reads configuration through `getEnv()` instead of touching
 * `process.env` directly. That gives us one place that documents every setting,
 * applies defaults, and fails fast with a readable message when something is
 * missing. `instrumentation.ts` calls `getEnv()` at server startup.
 */
import { IANAZone } from "luxon";
import { z } from "zod";

/** "true" / "false" strings → boolean. */
const bool = (fallback: "true" | "false") =>
  z.enum(["true", "false"]).default(fallback).transform((v) => v === "true");

const EnvSchema = z.object({
  // ── LLM: DeepSeek via AvalAI (OpenAI-compatible) ──
  AVALAI_API_KEY: z.string().min(1),
  AVALAI_BASE_URL: z.url().default("https://api.avalai.ir/v1"),
  LLM_MODEL: z.string().min(1).default("deepseek-chat"),

  // ── Google service account ──
  GOOGLE_SERVICE_ACCOUNT_EMAIL: z.email(),
  // .env files can't hold real newlines easily, so keys are usually stored with
  // literal "\n" sequences. Turn them back into newlines and strip stray quotes.
  GOOGLE_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((key) => key.replace(/^"|"$/g, "").replace(/\\n/g, "\n"))
    .refine((key) => key.includes("BEGIN PRIVATE KEY"), "does not look like a PEM private key"),
  SHEET_ID: z.string().min(1),

  // ── Manager & interview ──
  MANAGER_CALENDAR_ID: z.string().min(1),
  MANAGER_TIMEZONE: z
    .string()
    .default("Asia/Tehran")
    .refine((tz) => IANAZone.isValidZone(tz), "is not a valid IANA timezone"),
  MANAGER_NAME: z.string().min(1),
  MANAGER_EMAIL: z.email(),
  INTERVIEW_LOCATION: z.string().min(1),

  // ── Email (Resend) ──
  RESEND_API_KEY: z.string().min(1),
  EMAIL_FROM: z.string().min(3),
  SEND_REJECTION_EMAILS: bool("false"),
  SEND_RECEIPT_EMAILS: bool("true"),

  // ── Resume uploads ──
  RESUME_STORAGE_DIR: z.string().min(1).default("./storage/resumes"),
  MAX_RESUME_MB: z.coerce.number().positive().default(5),
  SCREEN_ON_UPLOAD: bool("true"),

  // ── Scheduler ──
  SLOT_STEP_MINUTES: z.coerce.number().int().positive().default(15),
  MIN_LEAD_HOURS: z.coerce.number().min(0).default(24),
  SEARCH_WEEKS: z.coerce.number().int().positive().default(6),

  // ── Security ──
  ADMIN_PASSWORD: z.string().min(8),
  CRON_SECRET: z.string().min(16),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | null = null;

/** Parse and cache the environment. Throws a readable error listing every problem. */
export function getEnv(): Env {
  if (cached) return cached;

  // `KEY=` in a .env file yields "" — treat that as "not set" so defaults apply.
  const raw = Object.fromEntries(
    Object.keys(EnvSchema.shape).map((key) => [key, process.env[key] || undefined]),
  );

  const result = EnvSchema.safeParse(raw);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  • ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(
      `Invalid environment configuration (check .env.local, see .env.example):\n${problems}`,
    );
  }

  cached = result.data;
  return cached;
}
