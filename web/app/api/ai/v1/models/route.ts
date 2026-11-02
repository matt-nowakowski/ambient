import { POLISH_MODEL_ID, authorize } from "@/lib/ai";
import { brand } from "@/lib/brand";

/** OpenAI-compatible model list: the single hosted polish model. */
export async function GET(req: Request) {
  const auth = authorize(req);
  if (!auth.ok) return Response.json({ error: { type: auth.error } }, { status: auth.status });
  return Response.json({
    object: "list",
    data: [{ id: POLISH_MODEL_ID, object: "model", created: 0, owned_by: brand.slug }],
  });
}
