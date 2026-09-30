/**
 * Admin authentication: one shared password → a signed, httpOnly session cookie.
 *
 * The cookie value is "<expiresAtMs>.<hmac>" where the HMAC is keyed with
 * ADMIN_PASSWORD. Nothing secret is stored in the cookie, and changing the
 * password instantly invalidates every existing session.
 *
 * Uses Web Crypto (crypto.subtle) so it works in proxy.ts and route handlers alike.
 */
import { getEnv } from "./env";

export const SESSION_COOKIE = "admin_session";
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7; // 7 days

const encoder = new TextEncoder();

async function hmacHex(message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(`admin-session:${getEnv().ADMIN_PASSWORD}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(message));
  return Buffer.from(signature).toString("hex");
}

/** Compare two strings in constant time (don't leak how many characters matched). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function checkPassword(input: string): Promise<boolean> {
  // Hash both sides first so lengths match and timing doesn't reveal the password length.
  const [given, expected] = await Promise.all([hmacHex(`pw:${input}`), hmacHex(`pw:${getEnv().ADMIN_PASSWORD}`)]);
  return safeEqual(given, expected);
}

export async function createSessionToken(): Promise<string> {
  const expiresAt = Date.now() + SESSION_MAX_AGE_SECONDS * 1000;
  return `${expiresAt}.${await hmacHex(String(expiresAt))}`;
}

export async function verifySessionToken(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const [expiresAt, signature] = token.split(".");
  if (!expiresAt || !signature || Number(expiresAt) < Date.now()) return false;
  return safeEqual(signature, await hmacHex(expiresAt));
}

/** True when the request carries a valid CRON_SECRET header (for scheduled screening). */
export function hasCronSecret(request: Request): boolean {
  const header = request.headers.get("x-cron-secret") ?? "";
  return safeEqual(header, getEnv().CRON_SECRET);
}

/** Read and verify the session cookie straight from a Request (used by route handlers). */
export async function isAdminRequest(request: Request): Promise<boolean> {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE}=([^;]+)`));
  return verifySessionToken(match ? decodeURIComponent(match[1]) : undefined);
}

/**
 * Guard for admin route handlers. proxy.ts already blocks unauthenticated
 * requests, but we check again here (defense in depth).
 * Returns a 401 Response to send back, or null when the caller is allowed.
 */
export async function requireAdmin(request: Request, { allowCron = false } = {}): Promise<Response | null> {
  if (await isAdminRequest(request)) return null;
  if (allowCron && hasCronSecret(request)) return null;
  return Response.json({ error: "ابتدا وارد پنل مدیریت شوید." }, { status: 401 });
}
