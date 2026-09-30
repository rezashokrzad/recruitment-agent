/**
 * Dummy environment for unit tests: lets lib/env.ts validate without real
 * secrets. Tests never call Google, AvalAI or Resend — those modules are mocked.
 */
const TEST_ENV: Record<string, string> = {
  AVALAI_API_KEY: "test",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@test.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----\\n",
  SHEET_ID: "test-sheet",
  MANAGER_CALENDAR_ID: "manager@example.com",
  MANAGER_TIMEZONE: "Asia/Tehran",
  MANAGER_NAME: "Test Manager",
  MANAGER_EMAIL: "manager@example.com",
  INTERVIEW_LOCATION: "Test office",
  RESEND_API_KEY: "test",
  EMAIL_FROM: "test@example.com",
  MAX_RESUME_MB: "5",
  ADMIN_PASSWORD: "test-password",
  CRON_SECRET: "test-cron-secret-0123456789",
};

for (const [key, value] of Object.entries(TEST_ENV)) process.env[key] = value;
