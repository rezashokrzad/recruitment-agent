/**
 * Contact Extraction Agent: the anti-hallucination checks and the regex fallback.
 * The LLM is mocked so we can make it "lie" and verify the lies are dropped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// The mock answers with `state.answer`, or fails like a network error when `state.fail` is set.
const state = vi.hoisted(() => ({ fail: false, answer: null as unknown }));
vi.mock("@/lib/llm", () => ({
  llmJson: vi.fn(async () => {
    if (state.fail) throw new Error("network down");
    return { data: state.answer, model: "test", latencyMs: 1, attempts: 1, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
  }),
}));

import { extractContact, findEmail, findPhone, guessName } from "@/lib/agents/contact";

const RESUME = `علی رضایی
توسعه‌دهنده فرانت‌اند
ایمیل: ai .dslanders@gmail .com
تلفن: 0912 345 6789
۵ سال تجربه React و TypeScript`;

const llmReturns = (data: { full_name: string | null; email: string | null; phone: string | null }) => {
  state.answer = data;
};

beforeEach(() => {
  state.fail = false;
  state.answer = null;
});

describe("regex helpers", () => {
  it("finds an email even when the PDF text split it with spaces", () => {
    expect(findEmail(RESUME)).toBe("ai.dslanders@gmail.com");
  });

  it("finds and normalizes an Iranian mobile number", () => {
    expect(findPhone(RESUME)).toBe("09123456789");
    expect(findPhone("Mobile: +98 912 345 6789")).toBe("09123456789");
  });

  it("guesses the name from a name-like first line only", () => {
    expect(guessName(RESUME)).toBe("علی رضایی");
    expect(guessName("John Tester\nAI Engineer")).toBe("John Tester");
    expect(guessName("Resume 2026\nJohn")).toBe(""); // digits → not a name
    expect(guessName("a@b.com")).toBe("");
  });

  it("returns empty strings when nothing is present", () => {
    expect(findEmail("no contact here")).toBe("");
    expect(findPhone("no contact here")).toBe("");
  });
});

describe("extractContact", () => {
  it("uses the LLM answer when every value is present in the resume", async () => {
    llmReturns({ full_name: "علی رضایی", email: "AI.DSLANDERS@gmail.com", phone: "0912-345-6789" });
    expect(await extractContact(RESUME)).toEqual({
      full_name: "علی رضایی",
      email: "ai.dslanders@gmail.com",
      phone: "09123456789",
    });
  });

  it("drops values the LLM invented and falls back to regex", async () => {
    llmReturns({ full_name: "محمد حسینی", email: "someone.else@example.com", phone: "09350000000" });
    expect(await extractContact(RESUME)).toEqual({
      full_name: "علی رضایی", // invented name discarded → first-line fallback
      email: "ai.dslanders@gmail.com", // regex fallback
      phone: "09123456789", // regex fallback
    });
  });

  it("falls back to regex when the LLM call fails", async () => {
    state.fail = true;
    expect(await extractContact(RESUME)).toEqual({ full_name: "علی رضایی", email: "ai.dslanders@gmail.com", phone: "09123456789" });
  });
});
