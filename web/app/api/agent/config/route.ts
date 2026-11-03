import { defaults, toPublic } from "@/lib/agent/config";
import { loadConfig } from "@/lib/agent/config-store";

/**
 * The agent's tunables for the desktop app: built-in defaults, plus values
 * the daily auto-tuning chose, plus manual overrides from /admin. The app
 * sends nothing but its version (`?v=`, unused for now, kept so a future
 * schema can vary by version) and applies every value only within its own
 * hard-coded bounds. Cached at the edge for an hour, so Neon is read at most
 * about once an hour per region; without Neon the defaults are served.
 */
export async function GET() {
  let values = defaults();
  try {
    const state = await loadConfig();
    values = state.values;
  } catch {
    // Defaults.
  }
  return Response.json(toPublic(values), {
    headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" },
  });
}
