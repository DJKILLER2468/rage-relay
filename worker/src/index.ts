import { GameError, newRoomCode, RoomDurableObject } from "../../server/rooms";

export { RoomDurableObject };

interface Env {
  ROOMS: DurableObjectNamespace;
  ALLOWED_ORIGINS: string;
}

const headersFor = (origin: string) => ({
  "Access-Control-Allow-Origin": origin,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "no-store",
  Vary: "Origin",
});

function trustedOrigin(request: Request, env: Env) {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS || "").split(",").map(value => value.trim()).filter(Boolean);
  return origin && allowed.includes(origin) ? origin : null;
}

function rejectOrigin() {
  return new Response("Origin is not allowed.", { status: 403, headers: { "Cache-Control": "no-store" } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = trustedOrigin(request, env);
    if (!origin) return rejectOrigin();
    const cors = headersFor(origin);

    if (request.method === "OPTIONS" && url.pathname === "/api/rooms") {
      return new Response(null, { status: 204, headers: cors });
    }

    const socketRoute = url.pathname.match(/^\/ws\/([A-Z2-9]{6})$/i);
    if (request.method === "GET" && socketRoute && request.headers.get("Upgrade")?.toLowerCase() === "websocket") {
      const code = socketRoute[1]!.toUpperCase();
      const target = new URL(request.url);
      target.pathname = "/socket";
      target.searchParams.set("code", code);
      return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(target, request));
    }

    if (url.pathname !== "/api/rooms" || request.method !== "POST") {
      return new Response("Not found.", { status: 404, headers: cors });
    }
    try {
      if (!request.headers.get("Content-Type")?.toLowerCase().includes("application/json")) {
        return Response.json({ error: "Use a JSON request." }, { status: 415, headers: cors });
      }
      const raw = await request.text();
      if (raw.length > 4096) return Response.json({ error: "Request too large." }, { status: 413, headers: cors });
      const input = JSON.parse(raw) as Record<string, unknown>;
      if (!input || typeof input !== "object" || Array.isArray(input)) throw new GameError("Invalid request.");
      let code = typeof input.code === "string" ? input.code.toUpperCase().trim() : "";
      if (input.action === "create") code = newRoomCode();
      if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("Enter the six-character room code.");
      const target = new URL("https://room.internal/api/rooms");
      target.searchParams.set("code", code);
      const response = await env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(new Request(target, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...input, code }),
      }));
      const responseHeaders = new Headers(response.headers);
      for (const [key, value] of Object.entries(cors)) responseHeaders.set(key, value);
      return new Response(response.body, { status: response.status, headers: responseHeaders });
    } catch (error) {
      if (error instanceof GameError) return Response.json({ error: error.message }, { status: error.status, headers: cors });
      if (error instanceof SyntaxError) return Response.json({ error: "Invalid JSON." }, { status: 400, headers: cors });
      console.error("Room request failed", error instanceof Error ? error.message : "unknown");
      return Response.json({ error: "Connection interrupted. Retrying…" }, { status: 503, headers: cors });
    }
  },
};
