import { env } from "cloudflare:workers";
import { handleAction, GameError } from "../../../server/rooms";
export const dynamic = "force-dynamic";
export async function POST(request: Request) {
  const headers = { "Cache-Control": "no-store", "Content-Type": "application/json" };
  try {
    const origin = request.headers.get("origin");
    if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Cross-origin requests are not accepted." }, { status: 403, headers });
    if (!request.headers.get("content-type")?.includes("application/json")) return Response.json({ error: "Use a JSON request." }, { status: 415, headers });
    const raw = await request.text();
    if (raw.length > 4096) return Response.json({ error: "Request too large." }, { status: 413, headers });
    const input = JSON.parse(raw);
    if (!input || typeof input !== "object" || Array.isArray(input)) throw new GameError("Invalid request.");
    if (!env.DB) return Response.json({ error: "Rooms are temporarily unavailable. You can still play solo practice." }, { status: 503, headers });
    return Response.json(await handleAction(env.DB, input), { headers });
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
    console.error("Room request failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Connection interrupted. Retrying…" }, { status: 503, headers });
  }
}
