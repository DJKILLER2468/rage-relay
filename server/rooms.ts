import { CHECKPOINTS, FINISH, FLOOR, LEVELS, PLAYER_H, WIDTH } from "../game/course";
import type { Player, Room } from "../game/protocol";
type PrivatePlayer = Player & { tokenHash: string };
type StoredRoom = Omit<Room, "players" | "serverNow"> & { players: PrivatePlayer[] };
type Row = { state: string; version: number; expires_at: number };
export class GameError extends Error { constructor(message: string, public status = 400) { super(message); } }
export type DB = { prepare: (sql: string) => any };
const TTL = 4 * 60 * 60 * 1000, alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function randomCode() { const a = crypto.getRandomValues(new Uint8Array(6)); return Array.from(a, x => alphabet[x % alphabet.length]).join(""); }
async function hash(s: string) { return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s))), b => b.toString(16).padStart(2, "0")).join(""); }
function nameOf(value: unknown) { const s = typeof value === "string" ? value.replace(/[\p{C}<>]/gu, "").trim().slice(0, 18) : ""; return s || "Player"; }
function player(slot: number, name: string, tokenHash: string, now: number): PrivatePlayer {
  return { slot, name, tokenHash, ready: false, x: 60, y: FLOOR - PLAYER_H, vx: 0, vy: 0, checkpoint: 0, deaths: 0, finishedAt: null, seq: -1, lastSeen: now, stateAt: now, departed: false, dead: false, maxX: 60 };
}
function publicRoom(s: StoredRoom, now: number): Room { return { code: s.code, round: s.round, phase: s.phase, startAt: s.startAt, levelId: s.levelId, serverNow: now, players: s.players.map(({ tokenHash: _, ...p }) => ({ ...p, stateAt: p.stateAt ?? p.lastSeen })) }; }
function numeric(x: unknown, min: number, max: number) { return typeof x === "number" && Number.isFinite(x) && x >= min && x <= max; }
async function mutate(db: DB, code: string, now: number, fn: (s: StoredRoom) => void) {
  for (let retry = 0; retry < 10; retry++) {
    const row = await db.prepare("SELECT state, version, expires_at FROM race_rooms WHERE code = ?").bind(code).first() as Row | null;
    if (!row || row.expires_at < now) throw new GameError("That room has expired or does not exist. Check the code or create a new room.", 404);
    const state = JSON.parse(row.state) as StoredRoom; fn(state);
    const changed = await db.prepare("UPDATE race_rooms SET state = ?, version = version + 1, expires_at = ? WHERE code = ? AND version = ? RETURNING version").bind(JSON.stringify(state), now + TTL, code, row.version).first();
    if (changed) return publicRoom(state, now);
    if (retry < 9) await new Promise(resolve => setTimeout(resolve, Math.min(4 + retry * 3, 22)));
  }
  throw new GameError("The room is busy. Reconnecting…", 409);
}
export async function handleAction(db: DB, input: Record<string, unknown>, now = Date.now()) {
  const action = input.action;
  if (action === "create") {
    await db.prepare("DELETE FROM race_rooms WHERE code IN (SELECT code FROM race_rooms WHERE expires_at < ? LIMIT 30)").bind(now).run();
    const token = crypto.randomUUID() + crypto.randomUUID();
    for (let i = 0; i < 5; i++) {
      const code = randomCode(), state: StoredRoom = { code, round: 0, phase: "lobby", startAt: 0, levelId: 0, players: [player(0, nameOf(input.name), await hash(token), now)] };
      const inserted = await db.prepare("INSERT INTO race_rooms (code, state, version, expires_at) VALUES (?, ?, 0, ?) ON CONFLICT(code) DO NOTHING RETURNING code").bind(code, JSON.stringify(state), now + TTL).first();
      if (inserted) return { room: publicRoom(state, now), session: { code, token, slot: 0 } };
    }
    throw new GameError("Could not create a room. Please try again.", 503);
  }
  const code = typeof input.code === "string" ? input.code.toUpperCase().trim() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("Enter the six-character room code.");
  if (action === "join") {
    const token = crypto.randomUUID() + crypto.randomUUID(), tokenHash = await hash(token); let slot = 1;
    const room = await mutate(db, code, now, s => {
      if (s.phase !== "lobby") throw new GameError("This race has already started. Ask your friend to return to the lobby.", 409);
      if (s.players.filter(p => !p.departed).length >= 4) throw new GameError("This room already has four players. Create another room.", 409);
      slot = [0, 1, 2, 3].find(candidate => !s.players.some(p => p.slot === candidate && !p.departed)) ?? -1;
      if (slot < 0) throw new GameError("This room is full. Create another room.", 409);
      s.players.push(player(slot, nameOf(input.name), tokenHash, now)); s.players.sort((a, b) => a.slot - b.slot);
    });
    return { room, session: { code, token, slot } };
  }
  if (typeof input.token !== "string" || input.token.length > 100) throw new GameError("Your session is missing. Rejoin the room.", 401);
  const tokenHash = await hash(input.token);
  const room = await mutate(db, code, now, s => {
    const p = s.players.find(p => p.tokenHash === tokenHash && !p.departed);
    if (!p) throw new GameError("Your session has ended. Create or join a room.", 401);
    const previousSeen = p.lastSeen; p.lastSeen = now;
    if (action === "leave") { if (s.phase === "lobby") s.players = s.players.filter(q => q !== p); else p.departed = true; return; }
    if (action === "set-level") {
      const levelId = input.levelId;
      if (p.slot !== 0) throw new GameError("Only the room host can choose the course.", 403);
      if (s.phase !== "lobby") throw new GameError("The course can only be changed in the lobby.", 409);
      if (!numeric(levelId, 0, LEVELS.length - 1) || !Number.isInteger(levelId)) throw new GameError("Choose a valid course.");
      s.levelId = levelId as number; s.players.forEach(q => { q.ready = false; });
    } else if (action === "ready") {
      if (s.phase === "racing" && !s.players.some(q => q.finishedAt !== null)) throw new GameError("Reach the finish before voting for the next map.");
      p.ready = input.ready === true;
      const active = s.players.filter(q => !q.departed);
      if (active.every(q => q.ready) && (s.phase === "lobby" ? active.length >= 2 : true)) {
        const finishingCampaign = s.phase === "racing" && s.round >= LEVELS.length;
        s.players = finishingCampaign ? active.map(q => ({ ...q, ready: false })) : active.map(q => player(q.slot, q.name, q.tokenHash, now));
        if (s.phase === "complete") { s.round = 1; s.levelId = 0; }
        else if (s.phase === "lobby") { s.round = 1; }
        else {
          if (s.round < LEVELS.length) s.levelId = (s.levelId + 1) % LEVELS.length;
          s.round++;
        }
        s.phase = s.round > LEVELS.length ? "complete" : active.length >= 2 ? "racing" : "lobby";
        s.startAt = s.phase === "racing" ? now + 3500 : 0;
      }
    } else if (action === "sync") {
      const u = input.state as Record<string, unknown> | undefined;
      if (u && s.phase === "racing" && input.round === s.round && now >= s.startAt && !p.finishedAt && numeric(u.seq, 0, 1e10) && (u.seq as number) > p.seq) {
        const sampleAt = u.at === undefined ? now : u.at;
        if (!numeric(u.x, 0, WIDTH) || !numeric(u.y, -300, 700) || !numeric(u.vx, -300, 300) || !numeric(u.vy, -700, 950) || !numeric(u.checkpoint, 0, CHECKPOINTS.length - 1) || !numeric(u.deaths, p.deaths, 100000) || !numeric(sampleAt, now - 1500, now + 250)) throw new GameError("Invalid player update.");
        const cp = u.checkpoint as number;
        if (!Number.isInteger(cp) || cp < p.checkpoint || cp > p.checkpoint + 1) throw new GameError("Checkpoint mismatch. Reconnect to the room.", 409);
        if (cp > p.checkpoint && (u.x as number) < CHECKPOINTS[cp]) throw new GameError("Checkpoint has not been reached.");
        const allowance = Math.max(280, (now - previousSeen + 1000) * .32);
        if ((u.x as number) > p.x + allowance && (u.deaths as number) === p.deaths) throw new GameError("Movement update was out of range. Reconnect to the room.", 409);
        p.x = u.x as number; p.y = u.y as number; p.vx = u.vx as number; p.vy = u.vy as number;
        // Keep the simulation sample time separate from request arrival time so
        // peers can compensate for upload latency instead of rendering behind.
        p.stateAt = Math.max(now - 350, Math.min(now, sampleAt as number));
        p.checkpoint = cp; p.deaths = Math.floor(u.deaths as number); p.seq = u.seq as number; p.dead = u.dead === true; p.maxX = Math.max(p.maxX, p.x);
        if (u.finished === true && p.checkpoint === CHECKPOINTS.length - 1 && p.x >= FINISH && p.y <= FLOOR - PLAYER_H + 2 && now - s.startAt > FINISH / 300 * 1000) p.finishedAt = Math.max(now, ...s.players.map(q => (q.finishedAt ?? 0) + 1));
      }
    } else throw new GameError("Unknown game action.");
  });
  return { room };
}
