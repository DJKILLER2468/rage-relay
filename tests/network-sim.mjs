import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const base = resolve('.sites-runtime/test-mods');
const { acceptPlayerState,publicRoom } = await import(pathToFileURL(resolve(base,'server/rooms.mjs')));
const { addRoomSample,interpolatePlayer } = await import(pathToFileURL(resolve(base,'game/interpolation.mjs')));

// Four real room sessions exchange 25 Hz movement and room snapshots over a
// deterministic lossy network: 150 ms one-way latency and 5% packet loss.
let seed=246813579;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/0x100000000;}
const latency=150, loss=.05, stepMs=10, tickMs=40, duration=8000;
const inbound=[], outbound=Array.from({length:4},()=>[]), peers=Array.from({length:4},()=>({samples:[],seen:0,latestSeq:Array(4).fill(-1)}));
let serverNow=1_003_700, room=globalThis.__rageTestRoom;
const sessions=globalThis.__rageTestSessions;
assert.equal(room.players.length,4);assert.equal(room.phase,'racing');
let nextInput=0,nextBroadcast=0,deliveredUp=0,deliveredDown=0,droppedUp=0,droppedDown=0;
const sentAt=Array(4).fill(0);
for(let elapsed=0;elapsed<=duration;elapsed+=stepMs){
  serverNow=1_003_700+elapsed;
  if(elapsed>=nextInput){
    nextInput+=tickMs;
    for(let slot=0;slot<4;slot++){
      const sample=sentAt[slot]++, x=60+sample*6;
      if(random()<loss){droppedUp++;continue;}
      inbound.push({due:elapsed+latency,slot,round:room.round,seq:sample,state:{x,y:414,vx:150,vy:0,checkpoint:0,deaths:0,dead:false,finished:false,seq:sample},created:elapsed});
    }
  }
  for(let i=inbound.length-1;i>=0;i--){
    const packet=inbound[i];if(packet.due>elapsed)continue;inbound.splice(i,1);deliveredUp++;
    await acceptPlayerState(room,sessions[packet.slot].token,{round:packet.round,state:packet.state},serverNow);
  }
  if(elapsed>=nextBroadcast){
    nextBroadcast+=tickMs;
    const snapshot=publicRoom(room,serverNow);
    for(let client=0;client<4;client++){
      if(random()<loss){droppedDown++;continue;}
      outbound[client].push({due:elapsed+latency,snapshot});
    }
  }
  for(let client=0;client<4;client++){
    const queue=outbound[client];
    for(let i=queue.length-1;i>=0;i--){
      const packet=queue[i];if(packet.due>elapsed)continue;queue.splice(i,1);deliveredDown++;
      peers[client].samples=addRoomSample(peers[client].samples,packet.snapshot);
      peers[client].seen++;
      for(const player of packet.snapshot.players)peers[client].latestSeq[player.slot]=Math.max(peers[client].latestSeq[player.slot],player.seq);
    }
  }
}

assert(deliveredUp>0&&deliveredDown>0);assert(droppedUp>0&&droppedDown>0);
assert(room.players.every(p=>p.seq>=100),`server did not receive enough movement: ${room.players.map(p=>p.seq)}`);
assert(peers.every(p=>p.seen>=100),`some clients did not receive enough snapshots: ${peers.map(p=>p.seen)}`);
for(const observer of peers){
  assert.equal(observer.latestSeq.length,4);
  assert(observer.latestSeq.every(seq=>seq>=90),`observer missed player state: ${observer.latestSeq}`);
  const maxGap=Math.max(...observer.latestSeq)-Math.min(...observer.latestSeq);
  assert(maxGap<20,`player streams diverged by ${maxGap} input ticks`);
  const renderAt=serverNow-latency-125;
  for(let slot=0;slot<4;slot++)assert(interpolatePlayer(observer.samples,slot,renderAt),`missing interpolated player ${slot}`);
}
console.log(`PASS 4-client WebSocket simulation: 150 ms one-way latency, 5% packet loss, ${deliveredUp} state packets and ${deliveredDown} snapshots delivered.`);

