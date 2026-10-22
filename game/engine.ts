import { CHECKPOINTS, FINISH, FLOOR, PLAYER_H, PLAYER_W, WIDTH, getPlatforms, getTraps, trapShape, overlaps } from "./course";
export type Inputs = { left: boolean; right: boolean; jump: boolean; retry: boolean };
export type Runner = {
  x: number; y: number; vx: number; vy: number; grounded: boolean; facing: number;
  checkpoint: number; deaths: number; finished: boolean; deadUntil: number;
  coyote: number; jumpBuffer: number; held: boolean; invincibleUntil: number;
  fragile: Record<string, number>; maxX: number; deathReason: string; levelId: number;
};
export type GameEvent = "jump" | "death" | "checkpoint" | "finish";
export const emptyInput = (): Inputs => ({ left: false, right: false, jump: false, retry: false });
export function makeRunner(checkpoint = 0, levelId = 0): Runner {
  return { x: CHECKPOINTS[checkpoint], y: FLOOR - PLAYER_H, vx: 0, vy: 0, grounded: true, facing: 1,
    checkpoint, deaths: 0, finished: false, deadUntil: 0, coyote: .11, jumpBuffer: 0, held: false,
    invincibleUntil: 0, fragile: {}, maxX: CHECKPOINTS[checkpoint], deathReason: "", levelId };
}
export function die(p: Runner, time: number, reason = "The floor had other plans.") {
  if (p.deadUntil || p.finished) return;
  p.deaths++; p.deadUntil = time + .62; p.vx = 0; p.vy = 0; p.deathReason = reason;
}
export function step(p: Runner, input: Inputs, dt: number, time: number): GameEvent[] {
  const events: GameEvent[] = [];
  if (p.finished) return events;
  if (p.deadUntil) {
    if (time >= p.deadUntil) {
      p.x = CHECKPOINTS[p.checkpoint]; p.y = FLOOR - PLAYER_H; p.deadUntil = 0;
      p.vx = p.vy = 0; p.grounded = true; p.fragile = {}; p.invincibleUntil = time + .65;
      p.held = input.jump; p.jumpBuffer = 0;
    }
    return events;
  }
  if (input.retry) { die(p, time, "A tactical restart. Obviously."); events.push("death"); return events; }
  if (input.jump && !p.held) p.jumpBuffer = .13;
  else p.jumpBuffer = Math.max(0, p.jumpBuffer - dt);
  if (p.grounded) p.coyote = .11; else p.coyote = Math.max(0, p.coyote - dt);
  if (p.jumpBuffer > 0 && p.coyote > 0) { p.vy = -620; p.grounded = false; p.coyote = 0; p.jumpBuffer = 0; events.push("jump"); }
  if (!input.jump && p.held && p.vy < -260) p.vy = -260;
  p.held = input.jump;
  const direction = Number(input.right) - Number(input.left), target = direction * 270;
  const acceleration = (p.grounded ? 2300 : 1700) * dt;
  p.vx += Math.max(-acceleration, Math.min(acceleration, target - p.vx));
  if (direction) p.facing = direction;
  const oldX = p.x, oldY = p.y;
  p.vy = Math.min(900, p.vy + 1700 * dt);
  p.x = Math.max(8, Math.min(WIDTH - PLAYER_W - 8, p.x + p.vx * dt)); p.y += p.vy * dt; p.grounded = false;
  const platforms = getPlatforms(p.levelId).filter(platform => !(platform.fragile && p.fragile[platform.id] !== undefined && time - p.fragile[platform.id] > .24));
  // Solid sides keep the runner from sliding into platform bodies. Passing up
  // through a platform is still allowed, as in a classic one-way platformer.
  for (const platform of platforms) {
    const verticalOverlap = p.y + PLAYER_H > platform.y + 2 && p.y < platform.y + platform.h - 2;
    if (!verticalOverlap) continue;
    if (p.vx > 0 && oldX + PLAYER_W <= platform.x + 1 && p.x + PLAYER_W > platform.x) {
      p.x = platform.x - PLAYER_W; p.vx = 0;
    } else if (p.vx < 0 && oldX >= platform.x + platform.w - 1 && p.x < platform.x + platform.w) {
      p.x = platform.x + platform.w; p.vx = 0;
    }
  }
  // Select the first surface crossed during this tick. Sorting prevents a
  // lower overlapping platform from winning just because it appeared first.
  const landing = platforms.filter(platform => {
    if (p.vy < 0 || oldY + PLAYER_H > platform.y + 1 || p.y + PLAYER_H < platform.y) return false;
    const dy = p.y - oldY, t = dy > 0 ? (platform.y - (oldY + PLAYER_H)) / dy : 0;
    const xAtLanding = oldX + (p.x - oldX) * Math.max(0, Math.min(1, t));
    return xAtLanding + PLAYER_W > platform.x && xAtLanding < platform.x + platform.w;
  }).sort((a, b) => a.y - b.y)[0];
  if (landing) {
    p.y = landing.y - PLAYER_H; p.vy = 0; p.grounded = true;
    if (landing.fragile && p.fragile[landing.id] === undefined) p.fragile[landing.id] = time;
  }
  if (time > p.invincibleUntil) {
    const hitbox = { x: p.x + 4, y: p.y + 4, w: PLAYER_W - 8, h: PLAYER_H - 5 };
    for (const trap of getTraps(p.levelId)) {
      const shape = trapShape(trap, time); if (!shape.active) continue;
      let hit = overlaps(hitbox, shape.rect);
      if (hit && shape.radius) {
        const cx = shape.rect.x + shape.radius, cy = shape.rect.y + shape.radius;
        const dx = cx - Math.max(hitbox.x, Math.min(cx, hitbox.x + hitbox.w)), dy = cy - Math.max(hitbox.y, Math.min(cy, hitbox.y + hitbox.h));
        hit = dx * dx + dy * dy < (shape.radius - 3) ** 2;
      }
      if (hit) { die(p, time, trap.kind === "saw" ? "Saw that coming. Eventually." : trap.kind === "press" ? "You have been compressed." : "A very pointed lesson."); events.push("death"); break; }
    }
  }
  if (p.y > 590 && !p.deadUntil) { die(p, time); events.push("death"); }
  if (!p.deadUntil) {
    p.maxX = Math.max(p.maxX, p.x);
    const next = p.checkpoint + 1;
    if (next < CHECKPOINTS.length && p.x >= CHECKPOINTS[next] && p.grounded) { p.checkpoint = next; events.push("checkpoint"); }
    if (p.x >= FINISH && p.grounded && p.checkpoint === CHECKPOINTS.length - 1) { p.finished = true; p.vx = 0; events.push("finish"); }
  }
  return events;
}
