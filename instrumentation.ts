/**
 * Runs once when the Next.js server starts.
 * We validate every environment variable here so a misconfiguration fails
 * immediately with a clear list of problems, instead of on the first request.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("./lib/env");
    getEnv();
    console.info("[startup] environment OK");
  }
}
