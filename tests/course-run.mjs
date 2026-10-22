import assert from 'node:assert/strict';
import { makeRunner,step,emptyInput } from '../.sites-runtime/test-mods/game/engine.mjs';
import { FINISH } from '../.sites-runtime/test-mods/game/course.mjs';
const actions = [
  {...emptyInput(),right:true,jump:true}, {...emptyInput(),right:true},
  {...emptyInput(),jump:true}, {...emptyInput()},
  {...emptyInput(),left:true,jump:true}, {...emptyInput(),left:true}
];
for(const levelId of Array.from({length:10},(_,i)=>i)){
let p=makeRunner(0,levelId),t=3.5;
for(let sector=0;sector<20;sector++){
  const goal=sector===19?FINISH:(sector+1)*800+60;
  let beam=[p],found=false;
  search: for(let depth=0;depth<280;depth++){
    const next=new Map();
    for(const old of beam)for(const input of actions){
      const q={...old,fragile:{...old.fragile}};
      for(let j=0;j<12;j++){step(q,input,1/120,t+depth*.1+j/120);if(q.deadUntil)break;}
      if(q.deadUntil||q.x<sector*800-20||q.y>510)continue;
      if(q.x>=goal&&q.grounded){p=q;t+= (depth+1)*.1;found=true;break search;}
      const key=[Math.round(q.x/9),Math.round(q.y/10),Math.round(q.vx/90),Math.round(q.vy/120),q.held].join(',');
      if(!next.has(key))next.set(key,q);
    }
    if(found)break;
    beam=[...next.values()].sort((a,b)=>(b.x-Math.max(0,b.y-410)*2)-(a.x-Math.max(0,a.y-410)*2)).slice(0,220);
    if(!beam.length)break;
  }
  assert(found,`No valid route found through sector ${sector+1}`);
  console.log(`PASS level ${levelId+1}, sector ${sector+1}: continuous physics route reached x=${Math.round(p.x)}, elapsed=${t.toFixed(1)}s`);
}
assert(p.finished);assert.equal(p.deaths,0);assert.equal(p.checkpoint,4);
console.log(`PASS Full course ${levelId+1} completed by physics planner with all checkpoints and active traps.`);
}
