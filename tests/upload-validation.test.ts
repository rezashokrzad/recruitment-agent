/**
 * Upload validation: the three rules the spec requires, plus the pieces they rely on.
 * Google Sheets, disk storage and the LLM are mocked — nothing leaves the test process.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// ── Mocks (hoisted above the imports below by vitest) ──
vi.mock("@/lib/sheets", () => ({
  getJob: vi.fn(),
  listCandidates: vi.fn(),
  appendCandidate: vi.fn(async () => undefined),
  appendLog: vi.fn(async () => undefined),
  nowIso: () => "2026-10-01T08:00:00.000Z",
}));
vi.mock("@/lib/pdf", () => ({
  extractResumeText: vi.fn(async () => ({ text: "رزومه آزمایشی ".repeat(40), readable: true, pages: 1 })),
}));
vi.mock("@/lib/agents/contact", () => ({
  extractContact: vi.fn(async () => ({ full_name: "سارا محمدی", email: "sara@example.com", phone: "09121234567" })),
  findEmail: vi.fn(() => ""),
}));
vi.mock("@/lib/storage", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/storage")>()),
  saveResume: vi.fn(async (id: string) => `storage/resumes/${id}.pdf`),
  deleteResume: vi.fn(),
}));

import { normalizePhone } from "@/lib/apply-schema";
import { submitApplication } from "@/lib/intake";
import * as sheets from "@/lib/sheets";
import { hasPdfMagicBytes, validateResumeFile } from "@/lib/storage";

const MB = 1024 * 1024;
const pdfBytes = (size = 2048) => {
  const bytes = new Uint8Array(size);
  bytes.set(new TextEncoder().encode("%PDF-1.7\n"));
  return bytes;
};
const asFile = (bytes: Uint8Array, name: string, type = "application/pdf") =>
  new File([bytes as BlobPart], name, { type });

const validFields = { job_id: "frontend-dev", consent: true };

beforeEach(() => {
  vi.mocked(sheets.getJob).mockResolvedValue({
    job_id: "frontend-dev",
    title_fa: "توسعه‌دهنده فرانت‌اند",
    description_fa: "…",
    min_score: 70,
    is_open: true,
  });
  vi.mocked(sheets.listCandidates).mockResolvedValue([]);
  vi.mocked(sheets.appendCandidate).mockClear();
});

describe("file validation (magic bytes, size)", () => {
  it("rejects a non-PDF file renamed to .pdf", async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
    expect(hasPdfMagicBytes(png)).toBe(false);
    expect(validateResumeFile(png, 5)).toEqual({ ok: false, error: "فقط فایل PDF معتبر پذیرفته می‌شود." });

    // End to end: name says .pdf and MIME says application/pdf — still rejected.
    const result = await submitApplication({ fields: validFields, file: asFile(png, "resume.pdf"), honeypot: "" });
    expect(result).toMatchObject({ ok: false, httpStatus: 400, fieldErrors: { file: expect.any(String) } });
    expect(sheets.appendCandidate).not.toHaveBeenCalled();
  });

  it("rejects an oversize file", async () => {
    const big = pdfBytes(5 * MB + 1);
    expect(validateResumeFile(big, 5)).toMatchObject({ ok: false });

    const result = await submitApplication({ fields: validFields, file: asFile(big, "big.pdf"), honeypot: "" });
    expect(result).toMatchObject({ ok: false, httpStatus: 400 });
    expect(result.ok === false && result.fieldErrors?.file).toContain("مگابایت");
    expect(sheets.appendCandidate).not.toHaveBeenCalled();
  });

  it("accepts a real PDF header at the size limit", () => {
    expect(validateResumeFile(pdfBytes(5 * MB), 5)).toEqual({ ok: true });
  });
});

describe("duplicates", () => {
  it("rejects a duplicate email + name + job (email read from the resume, case-insensitive)", async () => {
    vi.mocked(sheets.listCandidates).mockResolvedValue([
      { id: "old", full_name: "سارا محمدی", email: "SARA@example.com", job_id: "frontend-dev" } as never,
    ]);

    const result = await submitApplication({ fields: validFields, file: asFile(pdfBytes(), "cv.pdf"), honeypot: "" });
    expect(result).toMatchObject({ ok: false, httpStatus: 409 });
    expect(sheets.appendCandidate).not.toHaveBeenCalled();
  });

  it("allows the same email when the resume belongs to a different person", async () => {
    vi.mocked(sheets.listCandidates).mockResolvedValue([
      { id: "old", full_name: "علی رضایی", email: "sara@example.com", job_id: "frontend-dev" } as never,
    ]);

    const result = await submitApplication({ fields: validFields, file: asFile(pdfBytes(), "cv.pdf"), honeypot: "" });
    expect(result).toMatchObject({ ok: true, status: "new" });
  });

  it("allows the same email for a different job", async () => {
    vi.mocked(sheets.listCandidates).mockResolvedValue([
      { id: "old", email: "sara@example.com", job_id: "backend-dev" } as never,
    ]);

    const result = await submitApplication({ fields: validFields, file: asFile(pdfBytes(), "cv.pdf"), honeypot: "" });
    expect(result).toMatchObject({ ok: true, status: "new" });
    expect(sheets.appendCandidate).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "سارا محمدی",
        email: "sara@example.com",
        phone: "09121234567",
        status: "new",
        original_filename: "cv.pdf",
      }),
    );
  });
});

describe("other intake rules", () => {
  it("silently drops honeypot submissions", async () => {
    const result = await submitApplication({ fields: validFields, file: asFile(pdfBytes(), "cv.pdf"), honeypot: "http://spam" });
    expect(result).toEqual({ ok: true, spam: true });
    expect(sheets.appendCandidate).not.toHaveBeenCalled();
  });

  it("requires consent", async () => {
    const result = await submitApplication({
      fields: { ...validFields, consent: false },
      file: asFile(pdfBytes(), "cv.pdf"),
      honeypot: "",
    });
    expect(result).toMatchObject({ ok: false, fieldErrors: { consent: expect.any(String) } });
  });

  it("rejects a closed job", async () => {
    vi.mocked(sheets.getJob).mockResolvedValue({ job_id: "frontend-dev", title_fa: "", description_fa: "", min_score: 70, is_open: false });
    const result = await submitApplication({ fields: validFields, file: asFile(pdfBytes(), "cv.pdf"), honeypot: "" });
    expect(result).toMatchObject({ ok: false, fieldErrors: { job_id: expect.any(String) } });
  });

  it("normalizes Iranian phone numbers", () => {
    expect(normalizePhone("+98 912 123 4567")).toBe("09121234567");
    expect(normalizePhone("۰۹۱۲-۱۲۳-۴۵۶۷")).toBe("09121234567");
  });
});
