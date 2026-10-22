export class Sound {
  ctx: AudioContext | null = null;
  enabled = true;
  unlock() { if (!this.enabled) return; try { if (!this.ctx) this.ctx = new AudioContext(); if (this.ctx.state === "suspended") void this.ctx.resume(); } catch {} }
  play(kind: "jump" | "death" | "checkpoint" | "finish" | "click") {
    if (!this.enabled || !this.ctx || this.ctx.state !== "running") return;
    const c = this.ctx, t = c.currentTime, osc = c.createOscillator(), gain = c.createGain();
    osc.connect(gain); gain.connect(c.destination); osc.type = kind === "death" ? "sawtooth" : "sine";
    const f = kind === "jump" ? 260 : kind === "death" ? 170 : kind === "checkpoint" ? 520 : kind === "finish" ? 660 : 400;
    osc.frequency.setValueAtTime(f, t); osc.frequency.exponentialRampToValueAtTime(kind === "death" ? 45 : f * 1.8, t + .15);
    gain.gain.setValueAtTime(.0001, t); gain.gain.exponentialRampToValueAtTime(.055, t + .008); gain.gain.exponentialRampToValueAtTime(.0001, t + .19);
    osc.start(t); osc.stop(t + .2);
  }
}
