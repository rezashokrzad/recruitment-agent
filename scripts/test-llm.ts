/**
 * npm run test:llm
 * Pings DeepSeek through AvalAI with the configured model and prints the
 * JSON answer, latency and token usage. Use it to check your API key and model name.
 */
import "./load-env";
import { z } from "zod";
import { getEnv } from "@/lib/env";
import { llmJson } from "@/lib/llm";

async function main() {
  const env = getEnv();
  console.log(`→ ${env.AVALAI_BASE_URL}  model=${env.LLM_MODEL}`);

  const result = await llmJson({
    label: "ping",
    system: 'You are a connectivity test. Reply with JSON: {"ok": true, "greeting_fa": "<a one-sentence Farsi greeting>"}.',
    user: "سلام! این یک پیام آزمایشی است.",
    schema: z.object({ ok: z.literal(true), greeting_fa: z.string().min(1) }),
  });

  console.log("✓ response:", result.data);
  console.log(`✓ model=${result.model} latency=${result.latencyMs}ms tokens=${result.usage.totalTokens}`);
}

main().catch((err) => {
  console.error("✗ LLM test failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
