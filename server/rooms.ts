import { CHECKPOINTS, FINISH, FLOOR, LEVELS, PLAYER_H, WIDTH } from "../game/course";
import type { Player, Room } from "../game/protocol";

type PrivatePlayer = Player & { tokenHash: string; disconnectedAt: number | null };
type StoredRoom = Omit<Room, "players" | "serverNow" | "trapTime"> & { players: PrivatePlayer[]; updatedAt: number };
type Client = { socket: WebSocket; slot: number; token: string; tokenHash: string; lastPong: number; authAt: number };
export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
const TTL = 4 * 60 * 60 * 1000, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newRoomCode() { const a = crypto.getRandomValues(new Uint8Array(6)); return Array.from(a, x => alphabet[x % alphabet.length]).join(""); }
async function hash(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join(""); }
function nameOf(value: unknown) { const s = typeof value === "string" ? value.replace(/[\p{C}<>]/gu, "").trim().slice(0, 18) : ""; return s || "Player"; }
function player(slot: number, name: string, tokenHash: string, now: number): PrivatePlayer {
  return { slot, name, tokenHash, disconnectedAt: null, ready: false, x: 60, y: FLOOR - PLAYER_H, vx: 0, vy: 0, checkpoint: 0, deaths: 0, finishedAt: null, seq: -1, lastSeen: now, stateAt: now, departed: false, dead: false, maxX: 60 };
}
export function publicRoom(s: StoredRoom, now: number): Room {
  return { code: s.code, round: s.round, phase: s.phase, startAt: s.startAt, levelId: s.levelId, serverNow: now,
    trapTime: Math.max(0, (now - s.startAt) / 1000), players: s.players.map(({ tokenHash: _, disconnectedAt: __, ...p }) => ({ ...p, stateAt: p.stateAt ?? p.lastSeen })) };
}
function numeric(x: unknown, min: number, max: number) { return typeof x === "number" && Number.isFinite(x) && x >= min && x <= max; }

/** A single room's serialized state transitions. Safe to exercise without a Cloudflare runtime. */
export async function applyRoomAction(s: StoredRoom | null, input: Record<string, unknown>, now: number): Promise<{ state: StoredRoom; session?: { code: string; token: string; slot: number } }> {
  const action = input.action;
  if (action === "create") {
    if (s) throw new GameError("Could not create a room. Please try again.", 409);
    const code = String(input.code || "");
    if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("Could not create a room. Please try again.", 503);
    const token = crypto.randomUUID() + crypto.randomUUID();
    const state: StoredRoom = { code, round: 0, phase: "lobby", startAt: 0, levelId: 0, players: [player(0, nameOf(input.name), await hash(token), now)], updatedAt: now };
    return { state, session: { code, token, slot: 0 } };
  }
  if (!s || now - s.updatedAt > TTL) throw new GameError("That room has expired or does not exist. Check the code or create a new room.", 404);
  const state = structuredClone(s);
  state.players.forEach(p => { if (p.disconnectedAt !== null && now - p.disconnectedAt >= 30_000) p.departed = true; });
  const code = typeof input.code === "string" ? input.code.toUpperCase().trim() : "";
  if (code !== state.code) throw new GameError("Enter the six-character room code.");
  if (action === "join") {
    if (state.phase !== "lobby") throw new GameError("This race has already started. Ask your friend to return to the lobby.", 409);
    if (state.players.filter(p => !p.departed).length >= 4) throw new GameError("This room already has four players. Create another room.", 409);
    const slot = [0, 1, 2, 3].find(candidate => !state.players.some(p => p.slot === candidate && !p.departed)) ?? -1;
    if (slot < 0) throw new GameError("This room is full. Create another room.", 409);
    const token = crypto.randomUUID() + crypto.randomUUID();
    state.players = state.players.filter(p => p.slot !== slot);
    state.players.push(player(slot, nameOf(input.name), await hash(token), now)); state.players.sort((a, b) => a.slot - b.slot); state.updatedAt = now;
    return { state, session: { code, token, slot } };
  }
  if (typeof input.token !== "string" || input.token.length > 100) throw new GameError("Your session is missing. Rejoin the room.", 401);
  const tokenHash = await hash(input.token), p = state.players.find(q => q.tokenHash === tokenHash && !q.departed);
  if (!p) throw new GameError("Your session has ended. Create or join a room.", 401);
  const previousSeen = p.lastSeen; p.lastSeen = now; p.disconnectedAt = null;
  if (action === "leave") {
    if (state.phase === "lobby") state.players = state.players.filter(q => q !== p);
    else p.departed = true;
  } else if (action === "set-level") {
    const levelId = input.levelId;
    if (p.slot !== 0) throw new GameError("Only the room host can choose the course.", 403);
    if (state.phase !== "lobby") throw new GameError("The course can only be changed in the lobby.", 409);
    if (!numeric(levelId, 0, LEVELS.length - 1) || !Number.isInteger(levelId)) throw new GameError("Choose a valid course.");
    state.levelId = levelId as number; state.players.forEach(q => { q.ready = false; });
  } else if (action === "ready") {
    if (state.phase === "racing" && !state.players.some(q => q.finishedAt !== null)) throw new GameError("Reach the finish before voting for the next map.");
    p.ready = input.ready === true;
    const active = state.players.filter(q => !q.departed);
    if (active.length && active.every(q => q.ready) && (state.phase !== "lobby" || active.length >= 2)) {
      const restart = state.phase === "complete";
      state.players = active.map(q => player(q.slot, q.name, q.tokenHash, now));
      if (restart) { state.round = 1; state.levelId = 0; }
      else if (state.phase === "lobby") state.round = 1;
      else { if (state.round < LEVELS.length) state.levelId = (state.levelId + 1) % LEVELS.length; state.round++; }
      state.phase = state.round > LEVELS.length ? "complete" : active.length >= 2 ? "racing" : "lobby";
      state.startAt = state.phase === "racing" ? now + 3500 : 0;
    }
  } else if (action === "sync") {
    if (input.state && state.phase === "racing") await acceptPlayerState(state, input.token, input, now);
  } else throw new GameError("Unknown room action.");
  state.updatedAt = now;
  return { state };
}

export async function acceptPlayerState(s: StoredRoom, token: string, input: Record<string, unknown>, now: number) {
  const tokenHash = await hash(token), p = s.players.find(q => q.tokenHash === tokenHash && !q.departed);
  if (!p) throw new GameError("Your session has ended. Create or join a room.", 401);
  const previousSeen = p.lastSeen; p.lastSeen = now;
  if (s.phase !== "racing" || input.round !== s.round || now < s.startAt || p.finishedAt) return;
  const u = input.state as Record<string, unknown> | undefined;
  if (!u || !numeric(u.seq, 0, 1e10) || (u.seq as number) <= p.seq) return;
  const sampleAt = u.at === undefined ? now : u.at;
  if (!numeric(u.x, 0, WIDTH) || !numeric(u.y, -300, 700) || !numeric(u.vx, -300, 300) || !numeric(u.vy, -700, 950) || !numeric(u.checkpoint, 0, CHECKPOINTS.length - 1) || !numeric(u.deaths, p.deaths, 100000) || !numeric(sampleAt, now - 1500, now + 250)) return;
  const cp = u.checkpoint as number;
  if (!Number.isInteger(cp) || cp < p.checkpoint || cp > p.checkpoint + 1) return;
  if (cp > p.checkpoint && (u.x as number) < CHECKPOINTS[cp]) return;
  const allowance = Math.max(280, (now - previousSeen + 1000) * .32);
  if ((u.x as number) > p.x + allowance && (u.deaths as number) === p.deaths) return;
  p.x = u.x as number; p.y = u.y as number; p.vx = u.vx as number; p.vy = u.vy as number;
  p.stateAt = now; p.checkpoint = cp; p.deaths = Math.floor(u.deaths as number); p.seq = u.seq as number; p.dead = u.dead === true; p.maxX = Math.max(p.maxX, p.x);
  if (u.finished === true && p.checkpoint === CHECKPOINTS.length - 1 && p.x >= FINISH && p.y <= FLOOR - PLAYER_H + 2 && now - s.startAt > FINISH / 300 * 1000) p.finishedAt = Math.max(now, ...s.players.map(q => (q.finishedAt ?? 0) + 1));
  s.updatedAt = now;
}
export class RoomDurableObject {
  private state: StoredRoom | null = null;
  private loaded = false;
  private queue: Promise<unknown> = Promise.resolve();
  private clients = new Set<Client>();
  private broadcastTimer: ReturnType<typeof setInterval> | null = null;
  private lastHeartbeat = 0;
  private lastPersist = 0;
  constructor(private readonly ctx: DurableObjectState, private readonly env: Cloudflare.Env) {}
  private async load() { if (!this.loaded) { this.state = await this.ctx.storage.get<StoredRoom>("room") ?? null; if (this.state) for (const p of this.state.players) p.disconnectedAt ??= null; this.loaded = true; } return this.state; }
  private serialized<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.queue.then(fn, fn); this.queue = next.then(() => undefined, () => undefined); return next;
  }
  private async commit(state: StoredRoom) { this.state = state; this.loaded = true; this.lastPersist = Date.now(); await this.ctx.storage.put("room", state); }
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.headers.get("Upgrade")?.toLowerCase() === "websocket" || url.pathname.endsWith("/socket")) return this.openSocket(request, url);
    if (request.method !== "POST") return Response.json({ error: "Use the room WebSocket." }, { status: 405 });
    return this.serialized(async () => {
      try {
        const input = await request.json() as Record<string, unknown>, old = await this.load();
        const result = await applyRoomAction(old, { ...input, code: url.searchParams.get("code") || input.code }, Date.now());
        await this.commit(result.state); this.broadcast();
        return Response.json({ room: publicRoom(result.state, Date.now()), ...(result.session ? { session: result.session } : {}) }, { headers: { "Cache-Control": "no-store" } });
      } catch (e) { return errorResponse(e); }
    });
  }
  private async openSocket(request: Request, url: URL): Promise<Response> {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("WebSocket upgrade required", { status: 426 });
    const code = url.searchParams.get("code") || "";
    if (!/^[A-Z2-9]{6}$/.test(code)) return new Response("Invalid room code", { status: 400 });
    const room = await this.load(); if (!room || room.code !== code || Date.now() - room.updatedAt > TTL) return new Response("Room expired", { status: 404 });
    const pair = new WebSocketPair(), clientSocket = pair[0], serverSocket = pair[1];
    serverSocket.accept(); const client: Client = { socket: serverSocket, slot: -1, token: "", tokenHash: "", lastPong: Date.now(), authAt: Date.now() };
    this.clients.add(client); this.ensureBroadcast();
    serverSocket.addEventListener("message", event => { void this.onMessage(client, event.data); });
    const close = () => { this.clients.delete(client); if (client.slot >= 0 && !Array.from(this.clients).some(other => other.slot === client.slot)) void this.serialized(async () => { const state = await this.load(); const player = state?.players.find(p => p.slot === client.slot && p.tokenHash === client.tokenHash && !p.departed); if (player) { player.disconnectedAt = Date.now(); await this.commit(state!); } }); if (!this.clients.size && this.broadcastTimer) { clearInterval(this.broadcastTimer); this.broadcastTimer = null; } };
    serverSocket.addEventListener("close", close); serverSocket.addEventListener("error", close);
    return new Response(null, { status: 101, webSocket: clientSocket } as ResponseInit & { webSocket: WebSocket });
  }
  private ensureBroadcast() {
    if (this.broadcastTimer) return;
    this.broadcastTimer = setInterval(() => {
      this.broadcast(); const now = Date.now();
      if (now - this.lastHeartbeat >= 1000) { this.lastHeartbeat = now; this.heartbeat(); }
    }, 40);
  }
  private async onMessage(client: Client, data: string | ArrayBuffer) {
    if (typeof data !== "string" || data.length > 2048) return;
    let message: Record<string, unknown>;
    try { message = JSON.parse(data); } catch { return; }
    if (client.slot < 0) {
      if (message.type !== "auth") return;
      if (typeof message.token !== "string" || message.token.length > 100) { try { client.socket.close(1008, "Authenticate to join the room"); } catch {} return; }
      const room = await this.load(), tokenHash = await hash(message.token);
      const player = room?.players.find(p => p.tokenHash === tokenHash && !p.departed && (p.disconnectedAt === null || Date.now() - p.disconnectedAt < 30_000));
      if (!room || !player) { try { client.socket.close(1008, "Session ended"); } catch {} return; }
      player.disconnectedAt = null; player.lastSeen = Date.now(); room.updatedAt = Date.now(); await this.commit(room);
      client.slot = player.slot; client.token = message.token; client.tokenHash = tokenHash; client.lastPong = Date.now();
      try { client.socket.send(JSON.stringify({ type: "room", room: publicRoom(room, Date.now()) })); } catch { this.clients.delete(client); }
      return;
    }
    if (message.type === "pong" && typeof message.id === "number") {
      client.lastPong = Date.now();
      try { client.socket.send(JSON.stringify({ type: "pong", id: message.id, serverNow: Date.now() })); } catch {}
      return;
    }
    if (message.type !== "state") return;
    await this.serialized(async () => {
      const state = await this.load(); if (!state) return;
      try { await acceptPlayerState(state, client.token, { ...message, round: message.round, state: message.state }, Date.now()); }
      catch { return; }
      this.state = state;
      if (Date.now() - this.lastPersist >= 1000) await this.commit(state);
    });
  }
  private broadcast() {
    const s = this.state; if (!s || !this.clients.size) return;
    const payload = JSON.stringify({ type: "room", room: publicRoom(s, Date.now()) });
    for (const client of this.clients) {
      if (client.slot < 0) continue;
      try { client.socket.send(payload); } catch { this.clients.delete(client); }
    }
  }
  private heartbeat() {
    const now = Date.now();
    for (const client of this.clients) {
      if (client.slot < 0 && now - client.authAt > 5000) { try { client.socket.close(1008, "Authentication timeout"); } catch {} this.clients.delete(client); continue; }
      if (client.slot < 0) continue;
      if (now - client.lastPong > 12_000) { try { client.socket.close(1011, "Heartbeat timeout"); } catch {} this.clients.delete(client); continue; }
      try { client.socket.send(JSON.stringify({ type: "ping", id: now, serverNow: now })); } catch { this.clients.delete(client); }
    }
  }
}
function errorResponse(e: unknown) {
  if (e instanceof GameError) return Response.json({ error: e.message }, { status: e.status, headers: { "Cache-Control": "no-store" } });
  console.error("Room request failed", e instanceof Error ? e.message : "unknown");
  return Response.json({ error: "Connection interrupted. Retrying…" }, { status: 503, headers: { "Cache-Control": "no-store" } });
}
