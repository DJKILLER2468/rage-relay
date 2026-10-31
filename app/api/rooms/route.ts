import { env } from "cloudflare:workers";
import { GameError, newRoomCode } from "../../../server/rooms";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const headers = { "Cache-Control": "no-store" };
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return new Response("Cross-origin requests are not accepted.", { status: 403, headers });
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426, headers });
  const code = new URL(request.url).searchParams.get("code")?.toUpperCase().trim() || "";
  if (!/^[A-Z2-9]{6}$/.test(code)) return new Response("Invalid room code", { status: 400, headers });
  if (!env.ROOMS) return new Response("Rooms are temporarily unavailable.", { status: 503, headers });
  const target = new URL(request.url); target.pathname = "/socket"; target.searchParams.set("code", code);
  return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(target, request));
}

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
    if (!env.ROOMS) return Response.json({ error: "Rooms are temporarily unavailable. You can still play solo practice." }, { status: 503, headers });
    let code = typeof input.code === "string" ? input.code.toUpperCase().trim() : "";
    if (input.action === "create") code = newRoomCode();
    if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("Enter the six-character room code.");
    const target = new URL("https://room.internal/api/rooms"); target.searchParams.set("code", code);
    const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(target, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, code }) }));
    return new Response(response.body, { status: response.status, headers: { ...headers, ...Object.fromEntries(response.headers) } });
  } catch (e) {
    if (e instanceof GameError) return Response.json({ error: e.message }, { status: e.status, headers });
    if (e instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400, headers });
    console.error("Room request failed", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "Connection interrupted. Retrying…" }, { status: 503, headers });
  }
}
