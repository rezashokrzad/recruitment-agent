/**
 * The ONE AND ONLY entry point to a language model in this project.
 *
 * Model: DeepSeek, served through AvalAI's OpenAI-compatible API.
 * The `openai` npm package is used purely as an HTTP client pointed at
 * AVALAI_BASE_URL — no OpenAI models are ever called.
 *
 * Every call:
 *   • asks for JSON output (response_format: json_object), temperature 0.2
 *   • validates the JSON against a zod schema
 *   • retries up to 2 times if the JSON is invalid, telling the model what was wrong
 *   • logs model, latency and token usage
 */
import OpenAI from "openai";
import type { ChatCompletionMessageParam } from "openai/resources/chat/completions";
import { z } from "zod";
import { getEnv } from "./env";
import { singleton } from "./singleton";

const TEMPERATURE = 0.2;
const MAX_JSON_RETRIES = 2;

function client(): OpenAI {
  return singleton("llmClient", () => {
    const env = getEnv();
    return new OpenAI({
      apiKey: env.AVALAI_API_KEY,
      baseURL: env.AVALAI_BASE_URL,
      timeout: 90_000,
      maxRetries: 2, // network / 5xx retries, handled by the HTTP client
    });
  });
}

export type LlmUsage = { promptTokens: number; completionTokens: number; totalTokens: number };

export type LlmJsonResult<T> = {
  data: T;
  /** The model that actually answered (AvalAI may resolve an alias like deepseek-chat). */
  model: string;
  latencyMs: number;
  usage: LlmUsage;
  attempts: number;
};

export class LlmError extends Error {}

/**
 * Ask the model for a JSON object that matches `schema`.
 *
 * @param label  short name for logs, e.g. "screening"
 * @param system system prompt (instructions)
 * @param user   user message (the data to work on)
 * @param timeoutMs / httpRetries  override the client defaults for calls that
 *        must answer quickly (e.g. while an applicant waits on the upload page)
 */
export async function llmJson<T>({
  label,
  system,
  user,
  schema,
  timeoutMs,
  httpRetries,
}: {
  label: string;
  system: string;
  user: string;
  schema: z.ZodType<T>;
  timeoutMs?: number;
  httpRetries?: number;
}): Promise<LlmJsonResult<T>> {
  const { LLM_MODEL: model } = getEnv();
  const usage: LlmUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  const started = Date.now();

  // JSON mode requires the word "JSON" to appear in the prompt.
  const messages: ChatCompletionMessageParam[] = [
    { role: "system", content: `${system}\n\nRespond with a single valid JSON object only.` },
    { role: "user", content: user },
  ];

  let lastProblem = "";
  let servedModel = model;
  for (let attempt = 1; attempt <= 1 + MAX_JSON_RETRIES; attempt++) {
    const callStarted = Date.now();
    // The SDK treats a present `timeout` key as explicit, even when the value is
    // undefined, and then throws "timeout must be an integer". Omit the keys
    // unless this call actually overrides the client defaults.
    const completion = await client().chat.completions.create(
      {
        model,
        messages,
        temperature: TEMPERATURE,
        response_format: { type: "json_object" },
      },
      {
        ...(timeoutMs !== undefined ? { timeout: timeoutMs } : {}),
        ...(httpRetries !== undefined ? { maxRetries: httpRetries } : {}),
      },
    );

    servedModel = completion.model || model; // the provider may map an alias to a concrete version
    const callUsage = completion.usage;
    usage.promptTokens += callUsage?.prompt_tokens ?? 0;
    usage.completionTokens += callUsage?.completion_tokens ?? 0;
    usage.totalTokens += callUsage?.total_tokens ?? 0;

    console.info(
      `[llm] ${label} model=${servedModel} attempt=${attempt} ` +
        `latency=${Date.now() - callStarted}ms tokens(prompt=${callUsage?.prompt_tokens ?? "?"}, ` +
        `completion=${callUsage?.completion_tokens ?? "?"}, total=${callUsage?.total_tokens ?? "?"})`,
    );

    const content = completion.choices[0]?.message?.content ?? "";
    const parsed = parseJson(content);
    if (parsed.ok) {
      const validated = schema.safeParse(parsed.value);
      if (validated.success) {
        return { data: validated.data, model: servedModel, latencyMs: Date.now() - started, usage, attempts: attempt };
      }
      lastProblem = z.prettifyError(validated.error);
    } else {
      lastProblem = `Invalid JSON: ${parsed.error}`;
    }

    console.warn(`[llm] ${label} attempt=${attempt} rejected output: ${lastProblem}`);

    // Show the model its own answer and what was wrong, then try again.
    messages.push(
      { role: "assistant", content },
      {
        role: "user",
        content: `Your previous answer was not valid for the required JSON schema:\n${lastProblem}\nReturn ONLY the corrected JSON object.`,
      },
    );
  }

  throw new LlmError(`LLM (${label}) returned invalid JSON ${1 + MAX_JSON_RETRIES} times: ${lastProblem}`);
}

/** JSON.parse that also tolerates a ```json … ``` fence around the object. */
function parseJson(text: string): { ok: true; value: unknown } | { ok: false; error: string } {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```$/, "")
    .trim();
  try {
    return { ok: true, value: JSON.parse(cleaned) };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
