export type Rect = { x: number; y: number; w: number; h: number };
export type Platform = Rect & { id: string; fragile?: boolean };
export type Trap = { id: string; kind: "spikes" | "pop" | "saw" | "press"; x: number; w: number; phase: number };
export const WIDTH = 7300, FLOOR = 440, FINISH = 7160, PLAYER_W = 26, PLAYER_H = 34;
export const CHECKPOINTS = [60, 1660, 3260, 4860, 6460];
export const LEVELS = [
  { id: 0, name: "Bad Idea Factory", subtitle: "Crushers, saws, and deeply unreliable floors.", palette: "factory" },
  { id: 1, name: "Flooded Arcade", subtitle: "Raised walkways, neon hazards, tighter timing.", palette: "arcade" },
  { id: 2, name: "Toybox Catacombs", subtitle: "Fragile platforms and traps that punish rushing.", palette: "toybox" },
] as const;
export const CHAPTERS = [
  { name: "Warm welcome", subtitle: "The floor is mostly your friend.", color: "#b7ff62", start: 0 },
  { name: "Trust issues", subtitle: "That shortcut looks suspicious.", color: "#b59aff", start: 2400 },
  { name: "Last nerve", subtitle: "You have come too far to quit.", color: "#ff8858", start: 4800 },
];
export const platforms: Platform[] = [];
for (let i = 0; i < 9; i++) {
  const x = i * 800;
  platforms.push({ id: `${i}a`, x, y: FLOOR, w: 270, h: 160 }, { id: `${i}b`, x: x + 380, y: FLOOR, w: 240, h: 160 }, { id: `${i}c`, x: x + 740, y: FLOOR, w: i === 8 ? 160 : 60, h: 160 });
  if ([1, 4, 7].includes(i)) platforms.push({ id: `${i}f`, x: x + 270, y: FLOOR, w: 110, h: 22, fragile: true });
  if ([2, 5].includes(i)) platforms.push({ id: `${i}f`, x: x + 620, y: FLOOR, w: 120, h: 22, fragile: true });
}
export function getPlatforms(levelId = 0): Platform[] {
  if (levelId === 0) return platforms;
  return platforms.map((platform) => {
    const sector = Math.floor(platform.x / 800);
    if (levelId === 1 && platform.id === "7f") return { ...platform, fragile: false };
    if (levelId === 1 && platform.id.endsWith("b") && sector % 3 !== 0 && sector < 7) return { ...platform, y: FLOOR - 58 };
    if (levelId === 2 && platform.id.endsWith("b") && sector % 3 === 1 && sector < 7) return { ...platform, y: FLOOR - 58 };
    if (levelId === 2 && platform.id.endsWith("c") && sector % 3 === 2 && sector < 8) return { ...platform, fragile: true, h: 20 };
    return platform;
  });
}
export const traps: Trap[] = [
  { id: "s0", kind: "spikes", x: 505, w: 42, phase: 0 },
  { id: "s1", kind: "saw", x: 1180, w: 170, phase: .3 },
  { id: "s2", kind: "pop", x: 1790, w: 48, phase: .8 },
  { id: "s3", kind: "press", x: 2090, w: 62, phase: 0 },
  { id: "s4", kind: "pop", x: 2600, w: 62, phase: 1.1 },
  { id: "s5", kind: "spikes", x: 2850, w: 70, phase: 0 },
  { id: "s6", kind: "saw", x: 3580, w: 160, phase: 1 },
  { id: "s7", kind: "press", x: 4190, w: 64, phase: 1.2 },
  { id: "s8", kind: "pop", x: 4470, w: 72, phase: .4 },
  { id: "s9", kind: "spikes", x: 5000, w: 60, phase: 0 },
  { id: "s10", kind: "press", x: 5300, w: 66, phase: .3 },
  { id: "s11", kind: "pop", x: 5800, w: 65, phase: .7 },
  { id: "s12", kind: "saw", x: 5980, w: 170, phase: .7 },
  { id: "s13", kind: "pop", x: 6585, w: 55, phase: .3 },
  { id: "s14", kind: "press", x: 6850, w: 64, phase: .8 },
];
export function getTraps(levelId = 0): Trap[] {
  if (levelId === 0) return traps;
  if (levelId === 1) return traps.map((trap, index) => ({ ...trap, x: Math.max(120, Math.min(FINISH - 140, trap.x + (index === 11 ? 0 : index === 13 ? 100 : index % 2 ? -85 : 105))), phase: (trap.phase + .42) % 2.7, w: index === 12 ? 70 : trap.w, kind: index === 12 ? "pop" : index % 4 === 0 ? "saw" : trap.kind }));
  return traps.map((trap, index) => ({ ...trap, x: Math.max(120, Math.min(FINISH - 140, trap.x + (index % 2 ? 72 : -54))), phase: (trap.phase + .86) % 2.7, kind: index % 3 === 1 ? "pop" : trap.kind }));
}
export const signs = [
  { x: 105, text: "RUN. JUMP. REGRET.", sub: "Hold jump for more height." },
  { x: 850, text: "PERFECTLY SAFE", sub: "Probably." },
  { x: 1710, text: "CHECKPOINT SAVED", sub: "Take a breath. It gets worse." },
  { x: 2450, text: "TRUST ISSUES", sub: "Flashing lights mean trouble." },
  { x: 3310, text: "STILL FRIENDS?", sub: "A rematch fixes everything." },
  { x: 4850, text: "LAST NERVE", sub: "The finish is real. We checked." },
  { x: 5730, text: "FREE SHORTCUT →", sub: "Terms and conditions apply." },
  { x: 6510, text: "ONE. MORE. TRY.", sub: "You have made it this far." },
];
export function trapShape(trap: Trap, time: number): { rect: Rect; active: boolean; warning: boolean; radius?: number } {
  const t = Math.max(0, time) + trap.phase;
  if (trap.kind === "saw") {
    const cx = trap.x + trap.w / 2 + Math.sin(t * 2) * trap.w / 2;
    return { rect: { x: cx - 20, y: FLOOR - 49, w: 40, h: 40 }, radius: 20, active: true, warning: false };
  }
  if (trap.kind === "press") {
    const phase = t % 3.8;
    const depth = phase < 1.7 ? 0 : phase < 1.95 ? (phase - 1.7) / .25 : phase < 2.65 ? 1 : Math.max(0, 1 - (phase - 2.65) / .65);
    return { rect: { x: trap.x, y: 225, w: trap.w, h: 36 + depth * 180 }, active: depth > .05, warning: phase >= 1.2 && phase < 1.7 };
  }
  const phase = t % 2.7;
  return { rect: { x: trap.x, y: FLOOR - 22, w: trap.w, h: 22 }, active: trap.kind === "spikes" || (phase >= 1.2 && phase < 2.2), warning: trap.kind === "pop" && phase >= .7 && phase < 1.2 };
}
export function overlaps(a: Rect, b: Rect) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
