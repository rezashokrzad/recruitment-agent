/**
 * Tool: PDF text extraction + normalization.
 *
 * The screening agent reads plain text, so right after upload we:
 *   1. extract the text with pdf-parse,
 *   2. normalize Farsi (Arabic ي/ك → Persian ی/ک, Persian/Arabic digits → Latin),
 *   3. truncate to 40,000 characters (a Google Sheets cell holds at most 50,000),
 *   4. flag the resume "unreadable" when there is almost no text
 *      (typically a scanned image PDF with no text layer).
 */
import { PDFParse } from "pdf-parse";
import { toLatinDigits } from "./format";

export const MAX_RESUME_TEXT_CHARS = 40_000;
/** Fewer meaningful characters than this → treat as unreadable. */
export const MIN_READABLE_CHARS = 150;

export function normalizeFarsiText(text: string): string {
  return toLatinDigits(text)
    .replace(/ي/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/\u0000/g, "")
    .replace(/[ \t\f\v ]+/g, " ") // collapse spaces (ZWNJ ‌ is kept on purpose)
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export type ExtractedText = { text: string; readable: boolean; pages: number };

export async function extractResumeText(bytes: Uint8Array): Promise<ExtractedText> {
  // pdf.js takes ownership of (detaches) the buffer it is given, which would
  // leave the caller with 0 bytes to save. Hand it a copy.
  const parser = new PDFParse({ data: bytes.slice() });
  try {
    const result = await parser.getText();
    const withoutPageMarkers = result.text.replace(/^-- \d+ of \d+ --$/gm, "");
    const text = normalizeFarsiText(withoutPageMarkers).slice(0, MAX_RESUME_TEXT_CHARS);
    // Count letters/digits only, so page-number noise doesn't count as content.
    const meaningful = text.replace(/[^\p{L}\p{N}]/gu, "").length;
    return { text, readable: meaningful >= MIN_READABLE_CHARS, pages: result.total };
  } catch (err) {
    // A corrupt or encrypted PDF: keep the file, let the manager look at it.
    console.warn("[pdf] text extraction failed:", (err as Error).message);
    return { text: "", readable: false, pages: 0 };
  } finally {
    await parser.destroy();
  }
}
