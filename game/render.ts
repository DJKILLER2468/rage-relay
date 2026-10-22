import { CHECKPOINTS, CHAPTERS, FINISH, FLOOR, PLAYER_H, PLAYER_W, WIDTH, getPlatforms, getTraps, signs, trapShape } from "./course";
import type { Runner } from "./engine";
import type { Player } from "./protocol";
export const COLORS = ["#ff885b", "#6ae1e1", "#d9a7ff", "#f1d56b"];
export type RenderOptions = { p: Runner; peers: Player[]; slot: number; name: string; time: number; camera: number; preview?: boolean; reduced?: boolean };
function round(c: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number, color: string) { c.fillStyle = color; c.beginPath(); c.roundRect(x, y, w, h, r); c.fill(); }
function text(c: CanvasRenderingContext2D, s: string, x: number, y: number, size: number, color: string, font = "monospace", align: CanvasTextAlign = "left") { c.fillStyle = color; c.font = `700 ${size}px ${font}`; c.textAlign = align; c.fillText(s, x, y); }

export function drawCharacter(c: CanvasRenderingContext2D, x: number, y: number, slot: number, time: number, vx = 0, scale = 1, alpha = 1) {
  c.save(); c.translate(x + PLAYER_W / 2, y + PLAYER_H / 2); c.scale(scale, scale); c.globalAlpha = alpha;
  const bob = Math.abs(vx) > 20 ? Math.sin(time * 22) * 1.6 : Math.sin(time * 3) * .5;
  c.translate(0, bob); c.lineWidth = 3; c.strokeStyle = "#13181c";
  c.fillStyle = ["#b84c36", "#2d8d9c", "#754994", "#8b722d"][slot % 4];
  c.beginPath(); c.roundRect(-13, 9, 10, 10, 4); c.roundRect(3, 9, 10, 10, 4); c.fill(); c.stroke();
  c.fillStyle = COLORS[slot]; c.beginPath();
  if (slot % 4 === 0) {
    c.moveTo(-13, 10); c.quadraticCurveTo(-20, -3, -10, -17); c.lineTo(-4, -9); c.lineTo(2, -25); c.quadraticCurveTo(7, -13, 13, -6); c.quadraticCurveTo(23, 13, 6, 16); c.lineTo(-6, 16);
  } else if (slot % 4 === 1) {
    c.moveTo(1, -25); c.bezierCurveTo(5, -16, 19, -4, 17, 6); c.bezierCurveTo(14, 23, -16, 22, -17, 6); c.bezierCurveTo(-20, -5, -4, -17, 1, -25);
  } else if (slot % 4 === 2) {
    c.moveTo(0, -25); c.lineTo(15, -10); c.lineTo(18, 6); c.lineTo(10, 17); c.lineTo(-10, 17); c.lineTo(-18, 6); c.lineTo(-15, -10);
  } else {
    c.moveTo(-13, -8); c.quadraticCurveTo(-15, -24, 0, -26); c.quadraticCurveTo(16, -23, 13, -8); c.lineTo(17, 10); c.quadraticCurveTo(0, 20, -17, 10);
  }
  c.closePath(); c.fill(); c.stroke();
  c.fillStyle = ["#ffd286", "#baffee", "#f2d2ff", "#fff3ac"][slot % 4]; c.beginPath(); c.ellipse(-7, -7, 3, 6, .5, 0, Math.PI * 2); c.fill();
  round(c, -12, -4, 26, 13, 5, "#172027");
  c.fillStyle = "#fff8e8"; const dx = vx < 0 ? -1 : 1;
  c.fillRect(-7 + dx, 0, 5, 5); c.fillRect(3 + dx, 0, 5, 5);
  c.restore();
}

export function render(canvas: HTMLCanvasElement, opts: RenderOptions) {
  const c = canvas.getContext("2d"); if (!c) return;
  const rect = canvas.getBoundingClientRect(); if (!rect.width || !rect.height) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const pixelW = Math.round(rect.width * dpr), pixelH = Math.round(rect.height * dpr);
  if (canvas.width !== pixelW || canvas.height !== pixelH) { canvas.width = pixelW; canvas.height = pixelH; }
  const vh = 540, vw = rect.width / rect.height * vh;
  c.setTransform(canvas.width / vw, 0, 0, canvas.height / vh, 0, 0);
  const { p, slot, name, time, preview, reduced } = opts;
  const peers = opts.peers.filter(peer => !peer.dead && !peer.departed);
  const palette = p.levelId === 1
    ? { sky: ["#0c2334", "#102a42"], wall: "#12394a", wallDeep: "#0d2d3a", grid: "#1d5261", cable: "#37859b", floor: "#73d5d1", glow: "#60d9e8", fog: "#38a6ce" }
    : p.levelId === 2
      ? { sky: ["#302232", "#1f1b30"], wall: "#403047", wallDeep: "#2a2237", grid: "#60445b", cable: "#9b6282", floor: "#e7b56a", glow: "#ffbf64", fog: "#bb669c" }
      : { sky: ["#172224", "#101719"], wall: "#1c2b2a", wallDeep: "#152121", grid: "#2d3b32", cable: "#455044", floor: "#91a66e", glow: "#b7ff62", fog: "#79ba4d" };
  const camera = Math.max(0, Math.min(WIDTH - vw, opts.camera));
  const chapter = CHAPTERS[Math.min(2, Math.floor((camera + vw * .3) / 2400))];
  const bg = c.createLinearGradient(0, 0, 0, vh); bg.addColorStop(0, palette.sky[0]); bg.addColorStop(1, palette.sky[1]);
  c.fillStyle = bg; c.fillRect(0, 0, vw, vh);
  // Distant architecture, layered at a slower speed than the course.
  for (let i = -1; i < vw / 230 + 2; i++) {
    const x = i * 230 - camera * .18 % 230;
    round(c, x, 78, 150, 270, 70, palette.wall);
    round(c, x + 16, 95, 118, 240, 58, palette.wallDeep);
    c.fillStyle = "#22312b"; c.fillRect(x + 70, 95, 7, 240); c.fillRect(x + 16, 200, 118, 7);
    c.fillStyle = "#25362f"; c.fillRect(x - 25, 0, 15, 440);
  }
  c.strokeStyle = palette.grid; c.lineWidth = 2;
  for (let y = 25; y < 400; y += 54) {
    c.beginPath(); c.moveTo(0, y); c.lineTo(vw, y); c.stroke();
    for (let x = -100; x < vw + 100; x += 125) { const bx = x - camera * .35 % 125 + (Math.floor(y / 54) % 2) * 60; c.beginPath(); c.moveTo(bx, y); c.lineTo(bx, y + 54); c.stroke(); }
  }
  c.fillStyle = "#101719aa"; c.fillRect(0, 0, vw, 440);
  // Low-contrast cables overhead.
  c.strokeStyle = palette.cable; c.lineWidth = 4; c.beginPath(); c.moveTo(0, 22); c.bezierCurveTo(vw * .3, 80, vw * .7, -5, vw, 40); c.stroke();
  for (let i = 0; i < 4; i++) { const x = ((i * 350 - camera * .6) % (vw + 350) + vw + 350) % (vw + 350); c.fillStyle = "#0b1113"; c.fillRect(x, 0, 3, 100); round(c, x - 13, 95, 30, 9, 3, "#6b7862"); c.fillStyle = "#b7ff6215"; c.beginPath(); c.moveTo(x - 11, 104); c.lineTo(x - 90, 360); c.lineTo(x + 90, 360); c.lineTo(x + 17, 104); c.fill(); }
  c.save(); c.translate(-camera, 0);
  text(c, `SECTOR 0${Math.min(3, Math.floor((camera + 100) / 2400) + 1)}`, camera + 35, 68, 11, "#829181");
  for (const s of signs) if (s.x > camera - 250 && s.x < camera + vw + 100) {
    text(c, s.text, s.x, 303, 15, "#a8b59c"); text(c, s.sub, s.x, 325, 10, "#687b72");
    c.fillStyle = "#687b7240"; c.fillRect(s.x, 336, 48, 2);
  }
  for (const pl of getPlatforms(p.levelId)) {
    if (pl.x + pl.w < camera - 10 || pl.x > camera + vw + 10) continue;
    const broken = pl.fragile && p.fragile[pl.id] !== undefined && time - p.fragile[pl.id] > .24;
    if (broken) { c.globalAlpha = .15; round(c, pl.x, pl.y + 20, pl.w, 6, 0, "#b5ba7b"); c.globalAlpha = 1; continue; }
    const shake = pl.fragile && p.fragile[pl.id] !== undefined && !reduced ? Math.sin(time * 60) * 2 : 0;
    round(c, pl.x, pl.y + shake, pl.w, pl.h, 2, pl.fragile ? "#555a3d" : "#303d32");
    c.fillStyle = pl.fragile ? "#c0be76" : palette.floor; c.fillRect(pl.x, pl.y + shake, pl.w, 5);
    c.fillStyle = "#15231d"; c.fillRect(pl.x + 6, pl.y + 13, pl.w - 12, 3);
    c.strokeStyle = "#49563d"; c.lineWidth = 1;
    for (let xx = pl.x + 24; xx < pl.x + pl.w; xx += 48) { c.beginPath(); c.moveTo(xx, pl.y + 18); c.lineTo(xx, pl.y + pl.h); c.stroke(); }
    if (pl.fragile) { c.strokeStyle = "#161b13"; c.lineWidth = 2; c.beginPath(); c.moveTo(pl.x + 33, pl.y); c.lineTo(pl.x + 47, pl.y + 10); c.lineTo(pl.x + 39, pl.y + 19); c.stroke(); }
    else { c.strokeStyle = "#49563d"; c.beginPath(); c.moveTo(pl.x, 488); c.lineTo(pl.x + pl.w, 488); c.stroke(); }
  }
  for (const trap of getTraps(p.levelId)) {
    if (trap.x + trap.w < camera - 80 || trap.x > camera + vw + 80) continue;
    const { rect: r, active, warning, radius } = trapShape(trap, time);
    if (radius) {
      c.strokeStyle = "#59665e"; c.lineWidth = 4; c.beginPath(); c.moveTo(trap.x, FLOOR - 29); c.lineTo(trap.x + trap.w, FLOOR - 29); c.stroke();
      c.save(); c.translate(r.x + radius, r.y + radius); c.rotate(reduced ? 0 : time * 3);
      c.beginPath(); for (let j = 0; j < 24; j++) { const a = j / 24 * Math.PI * 2, rr = j % 2 ? 16 : 23; if (!j) c.moveTo(Math.cos(a) * rr, Math.sin(a) * rr); else c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fillStyle = "#d9ded0"; c.fill(); c.strokeStyle = "#1a2623"; c.lineWidth = 2; c.stroke();
      c.beginPath(); c.arc(0, 0, 7, 0, Math.PI * 2); c.fillStyle = "#f77e57"; c.fill(); c.restore();
    } else if (trap.kind === "press") {
      c.fillStyle = "#11191a"; c.fillRect(r.x + 10, 0, 9, r.y + r.h); c.fillRect(r.x + r.w - 19, 0, 9, r.y + r.h);
      c.fillStyle = "#69756b"; c.fillRect(r.x + 12, 145, 5, r.y + r.h - 145); c.fillRect(r.x + r.w - 17, 145, 5, r.y + r.h - 145);
      round(c, r.x, r.y + r.h - 34, r.w, 34, 3, "#d4b973");
      c.save(); c.beginPath(); c.rect(r.x, r.y + r.h - 34, r.w, 34); c.clip(); c.strokeStyle = "#323931"; c.lineWidth = 8;
      for (let x = r.x - 20; x < r.x + r.w + 30; x += 22) { c.beginPath(); c.moveTo(x, r.y + r.h); c.lineTo(x + 22, r.y + r.h - 34); c.stroke(); } c.restore();
      c.fillStyle = warning ? "#ff885b" : active ? "#f15d4e" : "#75916d"; c.fillRect(r.x + 18, 208, r.w - 36, 5);
    } else {
      c.fillStyle = warning ? "#ffb872" : "#5b6556"; c.fillRect(r.x - 4, FLOOR - 3, r.w + 8, 5);
      if (active) { c.fillStyle = "#f3ac89"; c.strokeStyle = "#4c3931"; c.lineWidth = 2;
        for (let x = r.x; x < r.x + r.w - 8; x += 14) { c.beginPath(); c.moveTo(x, FLOOR); c.lineTo(x + 7, FLOOR - 22); c.lineTo(x + 14, FLOOR); c.closePath(); c.fill(); c.stroke(); }
      } else if (warning) { for (let x = r.x; x < r.x + r.w; x += 12) { c.fillStyle = "#ff885b"; c.fillRect(x, FLOOR - 8, 5, 5); } }
    }
  }
  for (let i = 1; i < CHECKPOINTS.length; i++) {
    const x = CHECKPOINTS[i]; if (x < camera - 80 || x > camera + vw + 80) continue;
    const lit = p.checkpoint >= i;
    c.fillStyle = lit ? palette.glow : "#687760"; c.fillRect(x + 4, FLOOR - 80, 3, 80);
    c.beginPath(); c.moveTo(x + 7, FLOOR - 80); c.lineTo(x + 41, FLOOR - 80); c.lineTo(x + 32, FLOOR - 67); c.lineTo(x + 41, FLOOR - 54); c.lineTo(x + 7, FLOOR - 54); c.fill();
    text(c, `0${i}`, x + 16, FLOOR - 62, 12, "#142218");
    if (lit) { c.fillStyle = "#b7ff6212"; c.fillRect(x - 10, FLOOR - 60, 60, 60); }
  }
  // A visibly different, checkered finish gate.
  round(c, FINISH, FLOOR - 118, 74, 118, 8, palette.glow + "20");
  c.strokeStyle = palette.glow; c.lineWidth = 5; c.strokeRect(FINISH, FLOOR - 118, 74, 118);
  for (let i = 0; i < 8; i++) for (let j = 0; j < 2; j++) { c.fillStyle = (i + j) % 2 ? "#172521" : "#dce8cf"; c.fillRect(FINISH - 3 + i * 10, FLOOR - 119 + j * 10, 10, 10); }
  text(c, "FINISH", FINISH + 37, FLOOR - 138, 16, palette.glow, "monospace", "center");
  for (const peer of peers) {
    drawCharacter(c, peer.x, peer.y, peer.slot, time, peer.vx, 1, .7);
    text(c, peer.name, peer.x + 13, peer.y - 21, 10, COLORS[peer.slot % COLORS.length], "monospace", "center");
  }
  if (!p.deadUntil) {
    const invincible = time < p.invincibleUntil;
    if (Math.abs(p.vx) > 20 && p.grounded && !reduced) { c.fillStyle = COLORS[slot] + "44"; for (let i = 1; i < 4; i++) c.fillRect(p.x - p.facing * i * 9, p.y + 30 + Math.sin(i + time * 17) * 2, 5 - i, 3); }
    drawCharacter(c, p.x, p.y, slot, time, p.vx, 1, invincible ? .6 : 1);
    text(c, preview ? "YOU" : name, p.x + 13, p.y - 21, 10, COLORS[slot], "monospace", "center");
    if (!preview) { c.fillStyle = COLORS[slot]; c.beginPath(); c.moveTo(p.x + 9, p.y - 15); c.lineTo(p.x + 17, p.y - 15); c.lineTo(p.x + 13, p.y - 10); c.fill(); }
  } else if (!reduced) {
    const progress = Math.max(0, .62 - (p.deadUntil - time));
    c.fillStyle = COLORS[slot]; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6, rr = progress * 110; c.globalAlpha = Math.max(0, 1 - progress / .62); c.fillRect(p.x + 13 + Math.cos(a) * rr, p.y + 17 + Math.sin(a) * rr + progress * progress * 70, 5, 5); } c.globalAlpha = 1;
  }
  c.restore();
  const fog = c.createLinearGradient(0, 490, 0, vh); fog.addColorStop(0, palette.glow + "00"); fog.addColorStop(1, palette.fog + "36"); c.fillStyle = fog; c.fillRect(0, 490, vw, 50);
  c.strokeStyle = "#a9ed6628"; c.lineWidth = 2; c.beginPath();
  for (let x = 0; x <= vw; x += 12) { const y = 532 + Math.sin(x / 48 + (reduced ? 0 : time)) * 3; if (!x) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke();
  const peer = peers.sort((a, b) => Math.abs(a.x - (camera + vw / 2)) - Math.abs(b.x - (camera + vw / 2)))[0];
  if (peer && (peer.x < camera || peer.x > camera + vw)) {
    const right = peer.x > camera + vw, xx = right ? vw - 20 : 20;
    text(c, right ? "→" : "←", xx, 250, 24, COLORS[peer.slot % COLORS.length], "sans-serif", "center");
    text(c, peer.name, right ? vw - 40 : 40, 251, 11, COLORS[peer.slot % COLORS.length], "monospace", right ? "right" : "left");
  }
  if (preview) { text(c, chapter.name.toUpperCase(), vw - 24, 42, 10, "#b7ff62", "monospace", "right"); }
}
