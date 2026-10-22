export type Player = {
  slot: number; name: string; ready: boolean; x: number; y: number; vx: number; vy: number;
  checkpoint: number; deaths: number; finishedAt: number | null; seq: number;
  lastSeen: number; stateAt: number; departed: boolean; dead: boolean; maxX: number;
};
export type Room = { code: string; round: number; phase: "lobby" | "racing" | "complete"; startAt: number; levelId: number; players: Player[]; serverNow: number };
export type Session = { code: string; token: string; slot: number };
