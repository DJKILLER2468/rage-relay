export type Rect = { x: number; y: number; w: number; h: number };
export type Platform = Rect & { id: string; fragile?: boolean };
export type Trap = { id: string; kind: "spikes" | "pop" | "saw" | "press"; x: number; w: number; phase: number };
export const WIDTH = 7300, FLOOR = 440, FINISH = 7160, PLAYER_W = 26, PLAYER_H = 34;
export const CHECKPOINTS = [60, 1660, 3260, 4860, 6460];
export const LEVELS = [
  { id: 0, name: "Scrapline City", subtitle: "Learn the rhythm. The rooftops are optional.", palette: "factory" },
  { id: 1, name: "Neon Freight", subtitle: "Moving steel, high routes, tighter jumps.", palette: "arcade" },
  { id: 2, name: "Floodgate District", subtitle: "Rising walkways and floors that give way.", palette: "flood" },
  { id: 3, name: "Reactor Rows", subtitle: "Hot lanes. Short windows. Keep moving.", palette: "reactor" },
  { id: 4, name: "Rustyard Rush", subtitle: "Broken catwalks over a very bad drop.", palette: "rust" },
  { id: 5, name: "Skybridge Arsenal", subtitle: "Climb the upper route under fire.", palette: "sky" },
  { id: 6, name: "Blackout Barrage", subtitle: "Warning lights are your last advantage.", palette: "blackout" },
  { id: 7, name: "Iron Serpent", subtitle: "A long chain of traps with little room to stop.", palette: "iron" },
  { id: 8, name: "Tower Nine", subtitle: "Stacked platforms. Precise jumps. No soft landing.", palette: "tower" },
  { id: 9, name: "Last Stand Core", subtitle: "Everything you learned, all at once.", palette: "core" },
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
  const base = platforms.map((platform) => {
    const sector = Math.floor(platform.x / 800);
    if (levelId >= 1 && platform.id.endsWith("b") && (sector + levelId) % 3 !== 0 && sector < 8) return { ...platform, y: FLOOR - (levelId > 5 ? 68 : 58) };
    if (levelId >= 2 && platform.id.endsWith("c") && (sector + levelId) % 4 === 1 && sector < 8) return { ...platform, fragile: true, h: 20 };
    if (levelId >= 4 && platform.id.endsWith("f") && (sector + levelId) % 2 === 0) return { ...platform, fragile: true };
    return platform;
  });
  // Optional two-level catwalks. The ground path stays open while the raised
  // route rewards clean jumps and gives players a genuine multi-floor view.
  const upper: Platform[] = [];
  for (let sector = 0; sector < 9; sector++) {
    const x = sector * 800;
    if ((sector + levelId) % 2 === 0) upper.push({ id: `u${sector}a`, x: x + 215, y: FLOOR - 86, w: 150, h: 18 });
    if ((sector + levelId) % 3 !== 1) upper.push({ id: `u${sector}b`, x: x + 505, y: FLOOR - 142, w: 145, h: 18, fragile: levelId >= 6 && sector % 2 === 0 });
  }
  return [...base, ...upper];
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
  return traps.map((trap, index) => ({
    ...trap,
    x: Math.max(120, Math.min(FINISH - 140, trap.x + (index === 11 ? 0 : (index % 2 ? -1 : 1) * (12 + (levelId % 4) * 2)))),
    phase: (trap.phase + levelId * .21) % 2.7,
    w: levelId >= 7 && index % 4 === 0 ? Math.min(100, trap.w + 10) : trap.w,
    
  }));
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
