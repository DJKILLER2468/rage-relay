import { GameError, applyRoomAction, newRoomCode, publicRoom } from "./rooms";

type DB = { prepare: (sql: string) => any };
type Row = { state: string; version: number; expires_at: number };
const TTL = 4 * 60 * 60 * 1000;

/** Legacy D1 endpoint retained for the HTTP-polling client when no WS URL is configured. */
export async function handlePollingAction(db: DB, input: Record<string, unknown>, now = Date.now()) {
  if (input.action === "create") {
    await db.prepare("DELETE FROM race_rooms WHERE code IN (SELECT code FROM race_rooms WHERE expires_at < ? LIMIT 30)").bind(now).run();
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = newRoomCode();
      const result = await applyRoomAction(null, { ...input, code }, now);
      const inserted = await db.prepare("INSERT INTO race_rooms (code, state, version, expires_at) VALUES (?, ?, 0, ?) ON CONFLICT(code) DO NOTHING RETURNING code").bind(code, JSON.stringify(result.state), now + TTL).first();
      if (inserted) return { room: publicRoom(result.state, now), session: result.session };
    }
    throw new GameError("Could not create a room. Please try again.", 503);
  }

  const code = typeof input.code === "string" ? input.code.toUpperCase().trim() : "";
  if (!/^[A-Z2-9]{6}$/.test(code)) throw new GameError("Enter the six-character room code.");
  for (let attempt = 0; attempt < 10; attempt++) {
    const row = await db.prepare("SELECT state, version, expires_at FROM race_rooms WHERE code = ?").bind(code).first() as Row | null;
    if (!row || row.expires_at < now) throw new GameError("That room has expired or does not exist. Check the code or create a new room.", 404);
    const result = await applyRoomAction(JSON.parse(row.state), { ...input, code }, now);
    const changed = await db.prepare("UPDATE race_rooms SET state = ?, version = version + 1, expires_at = ? WHERE code = ? AND version = ? RETURNING version").bind(JSON.stringify(result.state), now + TTL, code, row.version).first();
    if (changed) return { room: publicRoom(result.state, now), ...(result.session ? { session: result.session } : {}) };
    if (attempt < 9) await new Promise(resolve => setTimeout(resolve, Math.min(4 + attempt * 3, 22)));
  }
  throw new GameError("The room is busy. Reconnecting…", 409);
}
