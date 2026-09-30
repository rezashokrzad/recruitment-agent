/**
 * POST /api/apply (public) — multipart form: job_id, consent, website (honeypot),
 * file (PDF). Name, email and phone are read from the resume itself.
 *
 * The applicant only ever learns "received" or a validation error —
 * never anything about screening.
 */
import { after } from "next/server";
import { HONEYPOT_FIELD } from "@/lib/apply-schema";
import { getEnv } from "@/lib/env";
import { submitApplication } from "@/lib/intake";
import { screenCandidate, sendReceiptForCandidate } from "@/lib/orchestrator";
import { clientIp, createRateLimiter } from "@/lib/rate-limit";

const uploadLimiter = createRateLimiter("apply", 5, 60 * 60 * 1000); // 5 successful uploads / hour / IP

export async function POST(request: Request) {
  const ip = clientIp(request);

  const limit = uploadLimiter.check(ip);
  if (!limit.ok) {
    return Response.json(
      { error: "تعداد درخواست‌ها بیش از حد مجاز است. لطفاً بعداً دوباره تلاش کنید." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSec) } },
    );
  }

  // Refuse obviously oversized bodies before reading them into memory.
  const maxBytes = getEnv().MAX_RESUME_MB * 1024 * 1024;
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes + 64 * 1024) {
    const error = `حجم فایل نباید بیشتر از ${getEnv().MAX_RESUME_MB} مگابایت باشد.`;
    return Response.json({ error, fieldErrors: { file: error } }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) return Response.json({ error: "درخواست نامعتبر است." }, { status: 400 });

  const file = form.get("file");
  try {
    const result = await submitApplication({
      fields: {
        job_id: form.get("job_id") ?? "",
        consent: form.get("consent") === "true",
      },
      file: file instanceof File ? file : null,
      honeypot: String(form.get(HONEYPOT_FIELD) ?? ""),
    });

    if (!result.ok) {
      return Response.json({ error: result.error, fieldErrors: result.fieldErrors }, { status: result.httpStatus });
    }

    if (!result.spam) {
      uploadLimiter.record(ip);
      const { candidateId, status } = result;
      // After the applicant already has their success response. Results stay on the admin side.
      if (getEnv().SCREEN_ON_UPLOAD && status === "new") {
        after(async () => {
          try {
            await screenCandidate(candidateId);
          } catch (err) {
            console.error("[apply] screen-on-upload failed:", (err as Error).message);
          }
        });
      }
      if (getEnv().SEND_RECEIPT_EMAILS) {
        after(async () => {
          try {
            await sendReceiptForCandidate(candidateId);
          } catch (err) {
            console.error("[apply] receipt email failed:", (err as Error).message);
          }
        });
      }
    }
    return Response.json({ ok: true });
  } catch (err) {
    console.error("[api/apply]", err);
    return Response.json({ error: "ثبت درخواست با خطا مواجه شد. لطفاً چند دقیقه بعد دوباره تلاش کنید." }, { status: 500 });
  }
}
