/**
 * Screening (and most other agents) call llmJson without a per-request timeout.
 * The OpenAI client throws "timeout must be an integer" if the options object
 * still contains `timeout: undefined`. These tests never call AvalAI.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const create = vi.hoisted(() => vi.fn());

vi.mock("openai", () => {
  class OpenAI {
    chat = { completions: { create } };
  }
  return { default: OpenAI };
});

import { llmJson } from "@/lib/llm";

const schema = z.object({ ok: z.literal(true) });

function answer() {
  return {
    model: "deepseek-chat",
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
    choices: [{ message: { content: '{"ok":true}' } }],
  };
}

beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue(answer());
  delete (globalThis as Record<string, unknown>).__recruitment_llmClient;
});

describe("llmJson request options", () => {
  it("omits timeout when the caller does not set one", async () => {
    await llmJson({ label: "screening", system: "Return JSON.", user: "hi", schema });
    expect(create.mock.calls[0][1]).not.toHaveProperty("timeout");
    expect(create.mock.calls[0][1]).not.toHaveProperty("maxRetries");
  });

  it("forwards an integer timeout when the caller sets one", async () => {
    await llmJson({
      label: "contact",
      system: "Return JSON.",
      user: "hi",
      schema,
      timeoutMs: 20_000,
      httpRetries: 0,
    });
    expect(create.mock.calls[0][1]).toMatchObject({ timeout: 20_000, maxRetries: 0 });
  });
});
