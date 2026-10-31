import type { Player, Room } from "./protocol";

export const INTERPOLATION_BUFFER_MS = 125;
export type PlayerSample = Player & { at: number };

export function addRoomSample(buffer: Room[], room: Room, maxSamples = 32) {
  const next = [...buffer];
  const index = next.findIndex(sample => sample.serverNow >= room.serverNow);
  if (index >= 0 && next[index]!.serverNow === room.serverNow) next[index] = room;
  else if (index >= 0) next.splice(index, 0, room);
  else next.push(room);
  while (next.length > maxSamples) next.shift();
  return next;
}

export function interpolatePlayer(buffer: Room[], slot: number, renderAt: number): Player | null {
  let before: PlayerSample | null = null, after: PlayerSample | null = null;
  for (const room of buffer) {
    const player = room.players.find(p => p.slot === slot);
    if (!player || player.departed) continue;
    const sample = { ...player, at: player.stateAt };
    if (sample.at <= renderAt) before = sample;
    if (sample.at >= renderAt) { after = sample; break; }
  }
  if (!before && !after) return null;
  if (!before) return { ...after! };
  if (!after) {
    const lead = Math.min(45, Math.max(0, renderAt - before.at)) / 1000;
    return { ...before, x: before.x + before.vx * lead, y: before.y + before.vy * lead + 850 * lead * lead };
  }
  if (after.at <= before.at) return { ...after };
  const t = Math.max(0, Math.min(1, (renderAt - before.at) / (after.at - before.at)));
  return { ...after,
    x: before.x + (after.x - before.x) * t,
    y: before.y + (after.y - before.y) * t,
    vx: before.vx + (after.vx - before.vx) * t,
    vy: before.vy + (after.vy - before.vy) * t,
  };
}
