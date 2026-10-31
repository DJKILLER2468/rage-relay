import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const base = resolve('.sites-runtime/test-mods');
for (const file of ['game/course','game/engine','game/protocol','game/interpolation','server/rooms']) {
  const output = resolve(base, file + '.mjs'); mkdirSync(dirname(output), { recursive:true });
  let code = ts.transpileModule(readFileSync(file + '.ts','utf8'), { compilerOptions:{ target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022 } }).outputText;
  code = code.replace(/(from\s+["'])(\.[^"']+)(["'])/g, '$1$2.mjs$3');
  writeFileSync(output,code);
}
const { makeRunner, step, emptyInput } = await import(pathToFileURL(resolve(base,'game/engine.mjs')));
const { CHECKPOINTS,FLOOR,PLAYER_H,FINISH,LEVELS,getPlatforms,getTraps,trapShape,traps } = await import(pathToFileURL(resolve(base,'game/course.mjs')));
const { applyRoomAction,acceptPlayerState,publicRoom } = await import(pathToFileURL(resolve(base,'server/rooms.mjs')));
const { addRoomSample,interpolatePlayer,INTERPOLATION_BUFFER_MS } = await import(pathToFileURL(resolve(base,'game/interpolation.mjs')));
let checks=0;
function check(name, fn) { fn(); checks++; console.log('PASS',name); }
const frame = 1/60;
check('60 Hz grounded movement and braking',()=>{const p=makeRunner();for(let i=0;i<30;i++)step(p,{...emptyInput(),right:true},frame,i*frame);assert(p.x>160&&p.x<200);assert.equal(p.y,FLOOR-PLAYER_H);for(let i=0;i<50;i++)step(p,emptyInput(),frame,1+i*frame);assert.equal(p.vx,0);});
check('Separate-axis collision lands on tops and blocks solid sides',()=>{const p=makeRunner();p.x=420;p.y=400;p.vy=800;step(p,emptyInput(),frame,2);assert.equal(p.y,FLOOR-PLAYER_H);assert(p.grounded);const q=makeRunner();q.x=352;q.y=440;q.vx=270;step(q,{...emptyInput(),right:true},frame,2);assert.equal(q.x,380-26);});
check('Pit jumps remain reachable at 60 Hz',()=>{for(const [start,end] of [[240,380],[590,740]]){const p=makeRunner();p.x=start;p.vx=270;let minY=p.y;for(let i=0;i<100;i++){step(p,{...emptyInput(),right:true,jump:true},frame,i*frame);minY=Math.min(minY,p.y);if(p.x>end+30&&p.grounded)break;}assert(p.x>end&&p.grounded&&!p.deadUntil);assert(minY<310);}});
check('Short tap produces a lower jump than a hold',()=>{function height(hold){const p=makeRunner();let min=440;for(let i=0;i<100;i++){step(p,{...emptyInput(),jump:i<hold},frame,i*frame);min=Math.min(min,p.y);}return min;}assert(height(60)<height(4)-30);});
check('Spikes kill once and respawn at current checkpoint',()=>{const p=makeRunner(1);p.x=505;p.invincibleUntil=0;step(p,emptyInput(),frame,4);assert.equal(p.deaths,1);assert(p.deadUntil);for(let i=0;i<45;i++)step(p,emptyInput(),frame,4+i*frame);assert.equal(p.deaths,1);assert.equal(p.x,CHECKPOINTS[1]);assert(!p.deadUntil);});
check('Cracked floors collapse consistently',()=>{const p=makeRunner();p.x=1100;for(let i=0;i<120;i++)step(p,emptyInput(),frame,1+i*frame);assert(p.deaths>=1);});
check('Trap timing is deterministic and crushers have safe windows',()=>{for(const t of traps){assert.deepEqual(trapShape(t,3.25),trapShape(t,3.25));if(t.kind==='press'){let safe=false,warn=false;for(let n=0;n<100;n++){const h=trapShape(t,n/20);safe ||= !h.active;warn ||= h.warning;}assert(safe&&warn);}}});
check('Ten maps retain distinct raised and down routes',()=>{assert.equal(LEVELS.length,10);assert.notDeepEqual(getTraps(0),getTraps(1));assert.notDeepEqual(getPlatforms(0),getPlatforms(1));assert(getPlatforms(9).some(p=>p.id.startsWith('u')&&p.y<FLOOR-80));assert(getPlatforms(0).some(p=>p.id.startsWith('d')&&p.y>FLOOR));});
check('Finishing requires all checkpoints',()=>{const p=makeRunner();p.x=FINISH;step(p,emptyInput(),frame,100);assert(!p.finished);const q=makeRunner(4);q.x=FINISH;q.invincibleUntil=101;step(q,emptyInput(),frame,100);assert(q.finished);});

const sessions=[]; let state=null, now=1_000_000;
let created=await applyRoomAction(state,{action:'create',code:'ABC234',name:'P1'},now);state=created.state;sessions[0]=created.session;
for(let i=1;i<4;i++){const r=await applyRoomAction(state,{action:'join',code:'ABC234',name:`P${i+1}`},now+i);state=r.state;sessions[i]=r.session;}
assert.equal(state.players.length,4);assert.equal(publicRoom(state,now).players.length,4);assert(!JSON.stringify(publicRoom(state,now)).includes('tokenHash'));checks++;console.log('PASS Durable Object room state accepts four players without exposing credentials');
await assert.rejects(()=>applyRoomAction(state,{action:'set-level',...sessions[1],levelId:2},now+5),{status:403});
state=(await applyRoomAction(state,{action:'set-level',...sessions[0],levelId:2},now+6)).state;
for(const session of sessions){const result=await applyRoomAction(state,{action:'ready',...session,ready:true},now+10);state=result.state;}
assert.equal(state.phase,'racing');assert.equal(state.startAt,now+3510);checks++;console.log('PASS Server owns shared ready state, countdown, and room clock');
let grace=(await applyRoomAction(null,{action:'create',code:'DEF345',name:'Host'},now+20)).state;
for(let i=1;i<4;i++)grace=(await applyRoomAction(grace,{action:'join',code:'DEF345',name:`G${i}`},now+20+i)).state;
grace.players[1].disconnectedAt=now+30;
await assert.rejects(()=>applyRoomAction(grace,{action:'join',code:'DEF345',name:'Early'},now+30_029),{status:409});
const afterGrace=await applyRoomAction(grace,{action:'join',code:'DEF345',name:'Replacement'},now+30_031);
assert.equal(afterGrace.session.slot,1);assert.equal(new Set(afterGrace.state.players.map(p=>p.slot)).size,4);checks++;console.log('PASS Disconnected player slot is reserved for 30 seconds, then reused cleanly');
await assert.rejects(()=>applyRoomAction(state,{action:'set-level',...sessions[0],levelId:3},now+20),{status:409});checks++;console.log('PASS Host cannot change the course after the shared race starts');
check('Snapshot interpolation uses a 125 ms render buffer and sample timestamps',()=>{const room1=publicRoom(state,now+4000), room2=publicRoom(state,now+4040);room1.players[1].x=100;room2.players[1].x=140;room1.players[1].stateAt=room1.serverNow;room2.players[1].stateAt=room2.serverNow;const samples=addRoomSample([room1],room2);const peer=interpolatePlayer(samples,1,room1.serverNow+20);assert.equal(INTERPOLATION_BUFFER_MS,125);assert.equal(peer.x,120);});

globalThis.__rageTestRoom=state;globalThis.__rageTestSessions=sessions;
await import('./network-sim.mjs');
console.log(`${checks} core checks passed.`);
