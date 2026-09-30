/**
 * POST /api/login   { password }  → sets the httpOnly session cookie
 * DELETE /api/login                → clears it (logout)
 */
import { z } from "zod";
import { checkPassword, createSessionToken, SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from "@/lib/auth";

const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

export async function POST(request: Request) {
  const body = z.object({ password: z.string() }).safeParse(await request.json().catch(() => null));
  if (!body.success || !(await checkPassword(body.data.password))) {
    // Slow down brute-force attempts a little.
    await new Promise((r) => setTimeout(r, 500));
    return Response.json({ error: "رمز عبور اشتباه است." }, { status: 401 });
  }

  const response = Response.json({ ok: true });
  const token = await createSessionToken();
  response.headers.append(
    "Set-Cookie",
    serializeCookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_MAX_AGE_SECONDS }),
  );
  return response;
}

export async function DELETE() {
  const response = Response.json({ ok: true });
  response.headers.append("Set-Cookie", serializeCookie(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 }));
  return response;
}

function serializeCookie(
  name: string,
  value: string,
  opts: typeof cookieOptions & { maxAge: number },
): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${opts.path}`,
    `Max-Age=${opts.maxAge}`,
    "HttpOnly",
    `SameSite=${opts.sameSite}`,
    opts.secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}
