"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, ArrowUp, Copy, Check, Volume2, VolumeX, X, RotateCcw, Flag, Skull, Users, HelpCircle, LogOut, Trophy, Link as LinkIcon, Maximize2, Zap } from "lucide-react";
import { makeRunner, step, emptyInput, type Runner, type Inputs } from "../game/engine";
import { CHAPTERS, CHECKPOINTS, FINISH, FLOOR, LEVELS, PLAYER_H, WIDTH } from "../game/course";
import { render, COLORS } from "../game/render";
import { Sound } from "../game/sound";
import type { Player, Room, Session } from "../game/protocol";

type Screen = "home" | "lobby" | "race";
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function request(body: object) {
  const res = await fetch("/api/rooms", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(5500) });
  const data = await res.json() as { error?: string; room: Room; session?: Session };
  if (!res.ok) throw new ApiError(data.error || "Could not connect. Please try again.", res.status);
  return data as { room: Room; session?: Session };
}
const fmt = (seconds: number) => `${Math.floor(Math.max(0, seconds) / 60).toString().padStart(2, "0")}:${Math.floor(Math.max(0, seconds) % 60).toString().padStart(2, "0")}`;
function Avatar({ slot, large = false }: { slot: number; large?: boolean }) {
  return <div className={`avatar avatar-${slot % 4} ${large ? "large" : ""}`} aria-label={["Rook", "Volt", "Dash", "Scout"][slot % 4] + " character"}><div className="avatar-face"><i /><i /></div></div>;
}
function Preview() {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let id = 0; const p = makeRunner();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const loop = (now: number) => {
      const t = reduced ? 1 : now / 1000; p.x = 190; p.y = 322 + Math.sin(t * 1.8) * 5; p.vx = 140; p.grounded = false;
      const peer = { slot: 1, name: "YOUR RIVAL", x: 460, y: FLOOR - PLAYER_H, vx: 0, dead: false, departed: false } as Player;
      if (canvas.current) render(canvas.current, { p, peers: [peer], slot: 0, name: "YOU", time: t, camera: 0, preview: true, reduced });
      id = requestAnimationFrame(loop);
    }; id = requestAnimationFrame(loop); return () => cancelAnimationFrame(id);
  }, []);
  return <canvas ref={canvas} className="preview-canvas" aria-label="Course preview: Ember and Ripple in a trap-filled factory" />;
}

export default function GameApp() {
  const [screen, setScreen] = useState<Screen>("home"), [name, setName] = useState(""), [code, setCode] = useState("");
  const [homeTab, setHomeTab] = useState<"create" | "join">("create");
  const [session, setSession] = useState<Session | null>(null), [room, setRoom] = useState<Room | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [help, setHelp] = useState(false), [muted, setMuted] = useState(false);
  const [toast, setToast] = useState(""), [connected, setConnected] = useState(true), [linkFallback, setLinkFallback] = useState(""), [pingMs, setPingMs] = useState(0);
  const [hud, setHud] = useState({ time: 0, deaths: 0, checkpoint: 0, x: 60, finished: false, dead: false, reason: "" });
  const canvas = useRef<HTMLCanvasElement>(null), gameShell = useRef<HTMLDivElement>(null), dialog = useRef<HTMLDialogElement>(null);
  const sessionRef = useRef<Session | null>(null), roomRef = useRef<Room | null>(null), runner = useRef<Runner>(makeRunner());
  const input = useRef<Inputs>(emptyInput()), sound = useRef<Sound | null>(null), seq = useRef(0), clockOffset = useRef(0);
  const lastGood = useRef(Date.now()), practiceStart = useRef(0), helpRef = useRef(false), leaving = useRef(false);
  const showToast = useCallback((message: string) => { setToast(message); }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(""), 2600); return () => clearTimeout(t); }, [toast]);
  useEffect(() => {
    sound.current = new Sound();
    try { setName(localStorage.getItem("rage-name") || ""); const m = localStorage.getItem("rage-muted") === "true"; setMuted(m); sound.current.enabled = !m; } catch {}
    const incoming = new URLSearchParams(location.search).get("room")?.toUpperCase();
    if (incoming) { setCode(incoming.slice(0, 6)); setHomeTab("join"); }
    try {
      const old = JSON.parse(sessionStorage.getItem("rage-session") || "null") as Session | null;
      if (old && typeof old.token === "string" && (!incoming || incoming === old.code)) { sessionRef.current = old; setSession(old); setBusy(true); }
    } catch {}
    return () => { void sound.current?.ctx?.close(); };
  }, []);
  useEffect(() => {
    helpRef.current = help; input.current = emptyInput();
    if (help) dialog.current?.showModal(); else dialog.current?.close();
  }, [help]);
  const acceptRoom = useCallback((r: Room, restore = false) => {
    const prev = roomRef.current;
    if (prev && ((r.round < prev.round && !(prev.phase === "complete" && r.phase === "racing" && r.round === 1)) || (r.round === prev.round && r.serverNow < prev.serverNow))) return;
    const mine = r.players.find(p => p.slot === sessionRef.current?.slot);
    if (mine && (restore || !prev || r.round !== prev.round)) {
      const p = makeRunner(mine.checkpoint, r.levelId);
      Object.assign(p, { x: mine.x, y: mine.y, vx: mine.vx, vy: mine.vy, deaths: mine.deaths, maxX: mine.maxX, finished: mine.finishedAt !== null, grounded: mine.y >= FLOOR - PLAYER_H - 1 });
      if (mine.dead) Object.assign(p, { x: CHECKPOINTS[mine.checkpoint], y: FLOOR - PLAYER_H, vx: 0, vy: 0, grounded: true });
      p.invincibleUntil = Math.max(0, (r.serverNow - r.startAt) / 1000) + .55;
      runner.current = p; seq.current = mine.seq + 1; input.current = emptyInput();
    }
    roomRef.current = r; setRoom(r); setScreen(r.phase === "lobby" ? "lobby" : "race");
    lastGood.current = Date.now(); setConnected(true); setBusy(false);
  }, []);
  useEffect(() => {
    if (!session) return;
    let cancelled = false, timer: ReturnType<typeof setTimeout>, restore = true;
    const poll = async () => {
      const s = sessionRef.current; if (!s || cancelled || leaving.current) return;
      const r = roomRef.current, p = runner.current, start = Date.now(); let retrySoon = false;
      const state = !restore && r?.phase === "racing" ? { x: p.x, y: p.y, vx: p.vx, vy: p.vy, checkpoint: p.checkpoint, deaths: p.deaths, dead: !!p.deadUntil, finished: p.finished, seq: seq.current++ } : undefined;
      try {
        const res = await request({ action: "sync", code: s.code, token: s.token, round: r?.round, state });
        if (cancelled || leaving.current) return;
        const end = Date.now(), estimate = res.room.serverNow - (start + end) / 2;
        const rtt = end - start; setPingMs(current => current ? Math.round(current * .65 + rtt * .35) : rtt);
        clockOffset.current = restore ? estimate : clockOffset.current * .85 + estimate * .15;
        acceptRoom(res.room, restore); restore = false;
      } catch (e) {
        if (cancelled) return;
        setConnected(false); setBusy(false);
        if (e instanceof ApiError && [401, 404].includes(e.status)) {
          setError(e.message); sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setScreen("home");
          try { sessionStorage.removeItem("rage-session"); } catch {} return;
        }
        if (e instanceof ApiError && e.status === 409) {
          if (/checkpoint mismatch|room state changed/i.test(e.message)) restore = true;
          else retrySoon = true;
        }
      }
      if (!cancelled) timer = setTimeout(poll, retrySoon ? 35 + Math.random() * 35 : !document.hidden && roomRef.current?.phase === "racing" ? 115 : 650);
    }; void poll(); return () => { cancelled = true; clearTimeout(timer); };
  }, [session?.token, acceptRoom]);

  useEffect(() => {
    if (screen !== "race") return;
    canvas.current?.focus(); let id = 0, last = 0, accumulator = 0, hudAt = 0, camera = Math.max(0, runner.current.x - 180);
    const peerVisual = new Map<number, Player>();
    const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    const key = (e: KeyboardEvent, down: boolean) => {
      if (["INPUT", "TEXTAREA"].includes((e.target as HTMLElement)?.tagName) || helpRef.current) return;
      const k = e.code;
      if (["ArrowLeft", "ArrowRight", "ArrowUp", "Space", "KeyA", "KeyD", "KeyW", "KeyR"].includes(k)) e.preventDefault();
      if (k === "ArrowLeft" || k === "KeyA") input.current.left = down;
      if (k === "ArrowRight" || k === "KeyD") input.current.right = down;
      if (["Space", "ArrowUp", "KeyW"].includes(k)) input.current.jump = down;
      if (k === "KeyR" && down && !e.repeat) input.current.retry = true;
      if (down) sound.current?.unlock();
    };
    const kd = (e: KeyboardEvent) => key(e, true), ku = (e: KeyboardEvent) => key(e, false), blur = () => { input.current = emptyInput(); };
    window.addEventListener("keydown", kd); window.addEventListener("keyup", ku); window.addEventListener("blur", blur); document.addEventListener("visibilitychange", blur);
    const loop = (timestamp: number) => {
      const dt = Math.min(.08, last ? (timestamp - last) / 1000 : 0); last = timestamp;
      const r = roomRef.current, s = sessionRef.current, p = runner.current;
      const elapsed = (Date.now() + (s ? clockOffset.current : 0) - (s ? r?.startAt || Date.now() : practiceStart.current)) / 1000;
      const online = !s || Date.now() - lastGood.current < 2500;
      if (elapsed >= 0 && online) {
        accumulator += dt;
        while (accumulator >= 1 / 120) {
          const events = step(p, input.current, 1 / 120, elapsed); input.current.retry = false;
          for (const event of events) { sound.current?.play(event); if (event === "checkpoint") showToast("CHECKPOINT SAVED · keep going"); }
          accumulator -= 1 / 120;
        }
      } else accumulator = 0;
      const peers = (r?.players || []).filter(q => q.slot !== s?.slot && !q.departed).map(targetPeer => {
        const age = Math.min(.22, Math.max(0, (Date.now() + clockOffset.current - targetPeer.lastSeen) / 1000));
        const target = { ...targetPeer, x: Math.max(8, Math.min(WIDTH - PLAYER_H, targetPeer.x + targetPeer.vx * age)), y: Math.max(-100, Math.min(480, targetPeer.y + targetPeer.vy * age + 850 * age * age)) };
        const old = peerVisual.get(targetPeer.slot);
        if (!old || Math.abs(old.x - target.x) > 240) peerVisual.set(targetPeer.slot, target);
        else { const amount = Math.min(1, dt * 22); peerVisual.set(targetPeer.slot, { ...target, x: old.x + (target.x - old.x) * amount, y: old.y + (target.y - old.y) * amount }); }
        return peerVisual.get(targetPeer.slot)!;
      });
      for (const slot of peerVisual.keys()) if (!peers.some(peer => peer.slot === slot)) peerVisual.delete(slot);
      if (canvas.current) {
        const box = canvas.current.getBoundingClientRect(), viewWidth = box.width / Math.max(box.height, 1) * 540;
        const target = Math.max(0, p.x - viewWidth * .31);
        camera = Math.abs(camera - target) > 900 || reduced ? target : camera + (target - camera) * Math.min(1, dt * 10);
        render(canvas.current, { p, peers, slot: s?.slot ?? 0, name: "YOU", time: Math.max(0, elapsed), camera, reduced });
      }
      if (timestamp - hudAt > 80) { setHud({ time: elapsed, deaths: p.deaths, checkpoint: p.checkpoint, x: p.x, finished: p.finished, dead: !!p.deadUntil, reason: p.deathReason }); setConnected(online); hudAt = timestamp; }
      id = requestAnimationFrame(loop);
    }; id = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(id); window.removeEventListener("keydown", kd); window.removeEventListener("keyup", ku); window.removeEventListener("blur", blur); document.removeEventListener("visibilitychange", blur); input.current = emptyInput(); };
  }, [screen, showToast]);

  async function enter(action: "create" | "join") {
    setError(""); setBusy(true); sound.current?.unlock(); leaving.current = false;
    try {
      const res = await request({ action, name: name.trim() || (action === "create" ? "Ember" : ["Ripple", "Glimmer", "Pebble"][Math.floor(Math.random() * 3)]), code });
      if (!res.session) throw new Error("The server did not return a session.");
      sessionRef.current = res.session; roomRef.current = null; setSession(res.session); acceptRoom(res.room, true);
      try { sessionStorage.setItem("rage-session", JSON.stringify(res.session)); localStorage.setItem("rage-name", name); } catch {}
    } catch (e) { setError(e instanceof Error ? e.message : "Could not connect. Try again."); } finally { setBusy(false); }
  }
  function practice() {
    sound.current?.unlock(); sound.current?.play("click"); leaving.current = false;
    runner.current = makeRunner(0, 0); roomRef.current = null; setRoom(null); sessionRef.current = null; setSession(null);
    practiceStart.current = Date.now() + 2000; input.current = emptyInput(); setHud({ time: -2, deaths: 0, checkpoint: 0, x: 60, finished: false, dead: false, reason: "" }); setScreen("race"); setError("");
  }
  async function ready() {
    const s = sessionRef.current; if (!s) return; setBusy(true); setError(""); sound.current?.unlock();
    try { const mine = roomRef.current?.players.find(q => q.slot === s.slot); const res = await request({ action: "ready", ...s, ready: !mine?.ready }); acceptRoom(res.room); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not update readiness."); } finally { setBusy(false); }
  }
  async function chooseLevel(levelId: number) {
    const s = sessionRef.current; if (!s || s.slot !== 0) return;
    setBusy(true); setError("");
    try { const res = await request({ action: "set-level", ...s, levelId }); acceptRoom(res.room); }
    catch (e) { setError(e instanceof Error ? e.message : "Could not change course."); }
    finally { setBusy(false); }
  }
  async function leave() {
    leaving.current = true; const s = sessionRef.current; input.current = emptyInput();
    if (s) { try { await request({ action: "leave", ...s }); } catch {} }
    sessionRef.current = null; roomRef.current = null; setSession(null); setRoom(null); setScreen("home"); setError(""); setBusy(false); setConnected(true);
    try { sessionStorage.removeItem("rage-session"); history.replaceState(null, "", location.pathname); } catch {}
  }
  function toggleSound() { const next = !muted; setMuted(next); if (sound.current) { sound.current.enabled = !next; if (!next) sound.current.unlock(); } try { localStorage.setItem("rage-muted", String(next)); } catch {} }
  async function copy(value: string, label = "Link copied") { try { await navigator.clipboard.writeText(value); showToast(label); } catch { setLinkFallback(value); } }
  function share() { if (session) void copy(`${location.origin}/?room=${session.code}`); }
  function touch(which: keyof Inputs, value: boolean) { input.current[which] = value; if (value) sound.current?.unlock(); }
  const me = room?.players.find(p => p.slot === session?.slot), others = room?.players.filter(p => p.slot !== session?.slot && !p.departed) || [];
  const finishers = room?.players.filter(p => p.finishedAt !== null).sort((a, b) => a.finishedAt! - b.finishedAt!) || [];
  const winner = finishers[0], stage = Math.min(2, Math.floor(hud.x / 2400));
  const ownColor = COLORS[(session?.slot ?? 0) % COLORS.length];

  return <main className={`app ${screen === "race" ? "in-race" : "home-screen"}`}>
    <header className="site-header">
      <button className="brand" onClick={() => screen === "home" ? undefined : void leave()} aria-label="Rage Relay home"><span className="brand-icon"><Zap size={23} fill="currentColor" /></span><span>RAGE<span className="brand-light">RELAY</span><small>FRIENDSHIP STRESS TEST</small></span></button>
      <div className="header-actions"><span className="status-label"><i /> 2–4 PLAYERS. ZERO MERCY.</span><button className="icon-button" onClick={toggleSound} aria-label={muted ? "Turn sound on" : "Mute sound"}>{muted ? <VolumeX size={19} /> : <Volume2 size={19} />}</button><button className="help-button" onClick={() => setHelp(true)}><HelpCircle size={17} /><span>How to play</span></button></div>
    </header>

    {screen === "home" && <>
      <section className="home-grid">
        <div className="hero-copy"><div className="eyebrow"><span className="tiny-plus">✳</span> THE COUCH RIVALRY. NOW ONLINE.</div><h1>ONE MORE<br /><span>TRY.</span><span className="title-star">✳</span></h1><p className="hero-description">Up to four rivals. Ten maps. One ten-minute speedrun.<br />Climb the catwalks. Outrun the traps.<br /><strong>Try to stay friends.</strong></p>
          <div className="entry-panel"><div className="entry-tabs" role="tablist" aria-label="Room options"><button role="tab" aria-selected={homeTab === "create"} className={homeTab === "create" ? "selected" : ""} onClick={() => { setHomeTab("create"); setError(""); }}>Create a room</button><button role="tab" aria-selected={homeTab === "join"} className={homeTab === "join" ? "selected" : ""} onClick={() => { setHomeTab("join"); setError(""); }}>Join a friend</button></div>
            <form onSubmit={e => { e.preventDefault(); void enter(homeTab); }}><label htmlFor="player-name">YOUR NAME <span>optional</span></label><input id="player-name" maxLength={18} placeholder="A future rage-quitter" value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" />
              {homeTab === "join" && <><label htmlFor="room-code">ROOM CODE</label><input id="room-code" className="code-input" placeholder="ABC123" maxLength={6} value={code} onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z2-9]/g, ""))} required minLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} /></>}
              {error && <p className="error" role="alert">{error}</p>}
              <button className="primary" disabled={busy} type="submit">{busy ? "Connecting…" : homeTab === "create" ? "Challenge a friend" : "Enter the room"}<ArrowRight size={20} /></button>
            </form><div className="entry-footer"><span><Users size={13} /> 2–4 players · no sign-up</span><button onClick={practice} disabled={busy}>Practice solo <ArrowRight size={13} /></button></div>
          </div>
        </div>
        <div className="hero-art"><div className="preview-frame"><div className="frame-top"><span><i /> LIVE FROM SCRAPLINE CITY</span><span>01—10</span></div><Preview /><div className="preview-bottom"><div><span className="small-dot ember" /> ROOK <span className="vs">VS</span><span className="small-dot ripple" /> VOLT</div><span>NO FRIENDLY FIRE. JUST UNFRIENDLY FLOORS.</span></div></div><div className="art-sticker"><Skull size={21} /><span>IT LOOKED<br /><b>JUMPABLE.</b></span></div><div className="art-note">famous last words ↗</div><div className="hero-tags"><span><Flag size={14} /> 10 maps</span><span><RotateCcw size={14} /> instant retries</span><span><Trophy size={14} /> ~10 min speedrun</span></div></div>
      </section>
      <section className="course-strip campaign-strip" aria-label="The ten-map campaign"><div className="strip-label">THE CAMPAIGN<span>TEN MAPS. ONE RUN.</span></div>{LEVELS.map((level, i) => <div key={level.name} className="chapter-card"><span className="chapter-num" style={{ color: ["#b7ff62", "#60d9e8", "#ffbf64", "#ff5b60", "#ffc65c"][i % 5] }}>{String(i + 1).padStart(2, "0")}</span><div><h2>{level.name}</h2><p>{level.subtitle}</p></div><span className="difficulty">THREAT {"▮".repeat(Math.min(5, Math.floor(i / 2) + 1))}</span></div>)}</section>
      <footer className="site-footer"><span>BUILT FOR “JUST ONE LAST ROUND.”</span><span>Keyboard + touch controls <span className="footer-cross">✳</span> Made for rivals, by Yuvraj</span></footer>
    </>}

    {screen === "lobby" && <section className="lobby">
      <button className="text-button" onClick={() => void leave()}><ArrowLeft size={16} /> Back</button><div className="eyebrow"><i className="online-dot" /> THE CALM BEFORE THE CHAOS</div><h1>RIVAL CHECK.</h1><p className="lobby-description">Invite up to three friends. Everyone hits ready. Let the bad decisions begin.</p>
      <div className="invite-card"><div><span className="label">ROOM CODE</span><button className="room-code" onClick={() => session && void copy(session.code, "Room code copied")}>{session?.code}<Copy size={18} /></button></div><button className="secondary" onClick={share}><LinkIcon size={17} /> Copy invite link</button></div>
      {linkFallback && <label className="fallback-link">Copy this link<input readOnly value={linkFallback} onFocus={e => e.target.select()} /></label>}
      <div className="course-choice"><div><b>COURSE</b><span>{LEVELS[Math.min(9, room?.levelId ?? 0)]!.subtitle}</span></div><select aria-label="Choose race course" value={room?.levelId ?? 0} disabled={busy || session?.slot !== 0 || room?.phase !== "lobby"} onChange={e => void chooseLevel(Number(e.target.value))}>{LEVELS.map(level => <option key={level.id} value={level.id}>{level.name}</option>)}</select>{session?.slot !== 0 && <small>Only the host chooses the course.</small>}</div>
      <div className="players-grid">{[0, 1, 2, 3].map(slot => { const p = room?.players.find(q => q.slot === slot); return <div key={slot} className={`player-card ${!p ? "empty-slot" : ""}`}><span className="player-slot">PLAYER 0{slot + 1} {slot === session?.slot && <b>YOU</b>}</span><Avatar slot={slot} large /><h2>{p?.name || (slot === 0 ? "Room host" : "Open slot")}</h2><span className="character-label" style={{ color: COLORS[slot] }}>{["ROOK", "VOLT", "DASH", "SCOUT"][slot]}</span><div className={`ready-status ${p?.ready ? "is-ready" : ""}`}>{!p ? <><i className="waiting-dot" /> Invite a player</> : p.ready ? <><Check size={16} /> Ready</> : <><i className="waiting-dot" /> Getting ready</>}</div></div>; })}</div>
      <div className="lobby-bottom"><p><Flag size={17} /> Finish the map, then vote to launch the next one. Deaths send you to your checkpoint.</p><button className="primary" onClick={() => void ready()} disabled={busy || !connected}>{me?.ready ? "Cancel ready" : "I’m ready"}{me?.ready ? <Check size={19} /> : <ArrowRight size={19} />}</button></div>
      {me?.ready && (room?.players.filter(p => !p.departed) || []).length < 2 && <p className="waiting-message">You’re ready. Share the code; the race starts with at least one rival.</p>}
      {!connected && <p className="error" role="status">Reconnecting to your room…</p>}{error && <p className="error" role="alert">{error}</p>}
    </section>}

    {screen === "race" && <section className="race-layout" ref={gameShell}>
      <div className="race-topline"><div className="course-title"><span style={{ color: CHAPTERS[stage].color }}>MAP {String(room ? Math.min(10, room.round) : runner.current.levelId + 1).padStart(2, "0")}/10</span><div><small>{session ? `ROOM ${session.code}` : "SOLO PRACTICE"}</small><h2>{LEVELS[Math.min(9, room?.levelId ?? runner.current.levelId)]!.name} · {CHAPTERS[stage].name}</h2></div></div><div className="race-tools"><span className={`connection ${connected ? "" : "offline"}`}><i />{session ? connected ? `LIVE · ${pingMs} MS` : "RECONNECTING" : "PRACTICE"}</span><button className="icon-button" aria-label="Fullscreen game" onClick={() => { if (document.fullscreenElement) void document.exitFullscreen(); else void gameShell.current?.requestFullscreen().catch(() => showToast("Fullscreen is unavailable in this browser.")); }}><Maximize2 size={17} /></button><button className="icon-button" aria-label="Leave race" onClick={() => void leave()}><LogOut size={17} /></button></div></div>
      <div className="race-progress"><div className="runner-row"><Avatar slot={session?.slot ?? 0} /><span>{me?.name || name || "You"}<small>YOU</small></span><div className="progress-track"><div style={{ width: `${Math.max(0, Math.min(100, hud.x / FINISH * 100))}%`, background: ownColor }} /></div><b style={{ color: ownColor }}>{Math.min(100, Math.floor(hud.x / FINISH * 100))}%</b></div>{others.map(other => <div className="runner-row" key={other.slot}><Avatar slot={other.slot} /><span>{other.name}<small>{room && room.serverNow - other.lastSeen > 8000 ? "OFFLINE" : "RIVAL"}</small></span><div className="progress-track"><div style={{ width: `${Math.min(100, other.x / FINISH * 100)}%`, background: COLORS[other.slot % COLORS.length] }} /></div><b style={{ color: COLORS[other.slot % COLORS.length] }}>{Math.min(100, Math.floor(other.x / FINISH * 100))}%</b></div>)}</div>
      <div className="game-stage"><canvas ref={canvas} tabIndex={0} aria-label="Trap platformer. Move with A and D or arrow keys. Hold Space or W to jump. R returns to your checkpoint." />
        {hud.time < 0 && <div className="game-overlay countdown"><span>GET READY</span><b>{Math.max(1, Math.ceil(-hud.time))}</b><p>Finish the map, then vote to advance.</p></div>}
        {!connected && session && <div className="game-overlay reconnect"><Zap size={30} /><h2>Hold that jump.</h2><p>Reconnecting… your movement is paused.</p><button className="secondary" onClick={() => void leave()}>Return home</button></div>}
        {hud.dead && !hud.finished && connected && <div className="death-message"><Skull size={18} />{hud.reason}</div>}
        {winner && !hud.finished && <div className="rival-finished"><Trophy size={16} /><span>{winner.name} finished. Keep racing, or vote to advance.</span><button onClick={() => void ready()} disabled={busy}>{me?.ready ? "Voted · waiting" : "Vote next map"}</button></div>}
        {hud.finished && <div className="game-overlay finish-overlay"><div className="finish-card"><div className="finish-medal"><Trophy size={32} /></div><div className="eyebrow">{!session ? "MAP COMPLETE" : !me?.finishedAt ? "CONFIRMING FINISH…" : winner?.slot === session.slot ? "MAP COMPLETE" : "MAP COMPLETE"}</div><h2>{room?.phase === "complete" ? "CAMPAIGN CLEARED." : !session || winner?.slot === session?.slot ? "YOU DID IT." : "MAP CLEAR."}</h2><p>{room?.phase === "complete" ? "You cleared all ten maps. Ready for another run?" : !session ? "Next map loading. The campaign keeps going." : `Map ${Math.min(10, (room?.round || 1) + 1)} is next. Vote when everyone is ready.`}</p><div className="finish-stats"><div><b>{fmt(me?.finishedAt && room ? (me.finishedAt - room.startAt) / 1000 : hud.time)}</b><span>FINISH TIME</span></div><div><b>{hud.deaths}</b><span>DEATHS</span></div></div>{session ? <button className="primary" onClick={() => void ready()} disabled={busy || !me?.finishedAt}>{room?.phase === "complete" ? "Start campaign again" : me?.ready ? "Cancel vote" : "Vote next map"}<ArrowRight size={18} /></button> : <button className="primary" onClick={() => { if (runner.current.levelId >= 9) { practice(); return; } const id = runner.current.levelId + 1; runner.current = makeRunner(0, id); practiceStart.current = Date.now() + 2000; input.current = emptyInput(); setHud({ time: -2, deaths: 0, checkpoint: 0, x: 60, finished: false, dead: false, reason: "" }); }}>Next map <ArrowRight size={18} /></button>}{me?.ready && <p className="rematch-note">Waiting for your rival to vote for a rematch.</p>}<button className="text-button centered" onClick={() => void leave()}>Back to home <ArrowRight size={14} /></button></div></div>}
      </div>
      <div className="game-bottom"><div className="game-stats"><span><Skull size={16} /><b>{hud.deaths}</b> DEATHS</span><span><Flag size={16} /><b>{hud.checkpoint}/4</b> CHECKPOINTS</span><span className="timer">{fmt(hud.time)}</span></div><button className="retry-button" onClick={() => { input.current.retry = true; canvas.current?.focus(); }}><RotateCcw size={15} /> Retry <kbd>R</kbd></button></div>
      <div className="touch-controls" aria-label="Touch controls"><div>{(["left", "right"] as const).map(direction => <button key={direction} className="touch-key" aria-label={`Move ${direction}`} onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); touch(direction, true); }} onPointerUp={() => touch(direction, false)} onPointerCancel={() => touch(direction, false)} onLostPointerCapture={() => touch(direction, false)} onContextMenu={e => e.preventDefault()}>{direction === "left" ? <ArrowLeft size={26} /> : <ArrowRight size={26} />}</button>)}</div><button className="touch-jump" aria-label="Jump" onPointerDown={e => { e.preventDefault(); e.currentTarget.setPointerCapture(e.pointerId); touch("jump", true); }} onPointerUp={() => touch("jump", false)} onPointerCancel={() => touch("jump", false)} onLostPointerCapture={() => touch("jump", false)} onContextMenu={e => e.preventDefault()}><ArrowUp size={24} /> JUMP</button></div>
      <div className="control-legend"><span><kbd>A</kbd><kbd>D</kbd> move</span><span><kbd>SPACE</kbd> jump · hold for height</span><span><kbd>R</kbd> checkpoint retry</span><span>Same course. Same traps. No player collisions.</span></div>
      {error && <p className="error" role="alert">{error}</p>}
    </section>}

    <dialog ref={dialog} onCancel={() => setHelp(false)} onClick={e => { if (e.target === dialog.current) setHelp(false); }} className="rules-dialog"><div className="rules-content"><button className="icon-button modal-close" onClick={() => setHelp(false)} aria-label="Close rules"><X size={22} /></button><span className="eyebrow">A VERY SIMPLE BAD IDEA</span><h2>RUN. JUMP.<br /><em>TRY AGAIN.</em></h2><ol><li><b>Bring your rivals.</b><p>Create a room and share its code or link. Two to four people join from their own devices. Everyone in the room clicks ready.</p></li><li><b>Get to the final flag first.</b><p>Race through ten maps that get tougher as you go. You can pass through each other. Everyone votes to roll onward after finishing.</p></li><li><b>Learn the traps.</b><p>Spikes, timed crushers, moving saws, and cracked floors will test you. Warning lights give you a chance. Trap timing is shared.</p></li><li><b>Die. Learn. Repeat.</b><p>Unlimited lives. Four checkpoint flags save your progress. Deaths cost time; they do not change the winner.</p></li></ol><div className="rules-controls"><span><kbd>A</kbd><kbd>D</kbd> or <kbd>←</kbd><kbd>→</kbd> move</span><span><kbd>SPACE</kbd> / <kbd>W</kbd> / <kbd>↑</kbd> jump</span><span><kbd>R</kbd> retry checkpoint</span></div><p className="rules-footnote">Hold jump to go higher. On phones, use the on-screen buttons; landscape gives you more room. Refreshing the same tab reconnects to your race.{screen === "race" && session ? " The online race keeps running while these rules are open." : ""}</p><button className="primary" onClick={() => setHelp(false)}>Understood. Probably.<ArrowRight size={19} /></button></div></dialog>
    {toast && <div className="toast" role="status"><Check size={16} />{toast}</div>}
  </main>;
}
