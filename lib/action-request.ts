/**
 * Read the optional `{ manager_note }` body of an admin action, and turn
 * orchestrator failures into JSON responses.
 */
import { z } from "zod";
import { OrchestratorError } from "./orchestrator";

const BodySchema = z.object({
  manager_note: z.string().max(2000).optional(),
});

export async function readManagerNote(request: Request): Promise<string | undefined> {
  const text = await request.text();
  if (!text.trim()) return undefined;
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new OrchestratorError("درخواست نامعتبر است.", 400);
  }
  const parsed = BodySchema.safeParse(json);
  if (!parsed.success) throw new OrchestratorError("یادداشت مدیر بیش از حد طولانی است.", 400);
  return parsed.data.manager_note;
}

export function actionErrorResponse(err: unknown): Response {
  if (err instanceof OrchestratorError) {
    return Response.json({ error: err.message }, { status: err.status });
  }
  console.error("[api/candidates]", err);
  return Response.json({ error: "عملیات با خطا مواجه شد." }, { status: 500 });
}
