import test from 'node:test';
import assert from 'node:assert/strict';
import {SessionWorlds} from '../server/sessions.js';
import {capsule,characterSkeleton} from '../web/render3d.js';
import {installDirectTouch} from '../web/touch-pose.js';

test('sessions are isolated, in RAM, and close/expire independently',()=>{
 let updates=0;const worlds=new SessionWorlds({ttlMs:1000,onUpdate:()=>updates++});
 const a=worlds.create(),b=worlds.create();
 const one=worlds.get(a.sessionId),two=worlds.get(b.sessionId);
 one.apply([{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:71}],0);
 assert.equal(updates,1);assert.equal(one.scene.entities[1].pose.rightElbow.flexion,71);
 assert.equal(two.scene.entities[1].pose.rightElbow.flexion,0);
 assert.equal(one.storageFile,null);
 worlds.close(a.sessionId);assert.throws(()=>worlds.get(a.sessionId),e=>e.code==='SESSION_EXPIRED');
 worlds.sessions.get(b.sessionId).lastUsed=Date.now()-2000;
 worlds.sweep();assert.throws(()=>worlds.get(b.sessionId),e=>e.code==='SESSION_EXPIRED');
});

test('rounded capsule has dense watertight ring topology with finite normals',()=>{
 const mesh=capsule(9,28),rings=20,sides=28;
 assert.equal(mesh.vertices.length/6,rings*(sides+1));
 assert.equal(mesh.indices.length,(rings-1)*sides*6);
 assert.ok(mesh.indices.every(i=>i>=0&&i<mesh.vertices.length/6));
 assert.ok(mesh.vertices.every(n=>Number.isFinite(n)));
 assert.ok(mesh.vertices.some((n,i)=>i%6===0&&n>.8));
});

test('throttles multiple move events to one IK calculation per animation frame, commits final pose immediately',()=>{
 const callbacks=[];let rafId=0;const formerRAF=globalThis.requestAnimationFrame,formerCancel=globalThis.cancelAnimationFrame;
 globalThis.requestAnimationFrame=cb=>{callbacks.push({id:++rafId,cb});return rafId;};
 globalThis.cancelAnimationFrame=id=>{const i=callbacks.findIndex(x=>x.id===id);if(i>=0)callbacks.splice(i,1);};
 const entity=structuredClone(new SessionWorlds().create().scene.entities.find(e=>e.id==='patient'));
 const world={scene:{entities:[entity]}};
 const project=p=>({x:320+p[0]*110+p[2]*35,y:180-p[1]*115+p[2]*50,z:.2,visible:true});
 const canvas=new EventTarget();canvas.getBoundingClientRect=()=>({left:0,top:0});canvas.setPointerCapture=()=>{};canvas.style={};
 const camera={distance:5,azimuth:.5,elevation:.4,target:[0,1,0]};const commits=[];
 const ctl=installDirectTouch({canvas,getWorld:()=>world,project,skeleton:characterSkeleton,assetPosition:e=>e.position,camera,onCommit:ops=>commits.push(ops)});
 const send=(type,id,x,y)=>{const e=new Event(type);Object.assign(e,{pointerId:id,clientX:x,clientY:y});canvas.dispatchEvent(e);};
 try{
  const p=project(characterSkeleton(entity).joints.rightWrist);
  send('pointerdown',1,p.x,p.y);
  for(let i=1;i<=30;i++)send('pointermove',1,p.x-i*1.7,p.y-i*1.5);
  assert.equal(callbacks.length,1,'IK should not run 30 times in a single animation frame');
  callbacks.shift().cb();
  assert.notEqual(entity.pose.rightShoulder.abduction,8);
  send('pointerup',1,p.x-51,p.y-45);
  assert.equal(commits.length,1);assert.ok(commits[0].length>0);
 }finally{ctl.destroy();globalThis.requestAnimationFrame=formerRAF;globalThis.cancelAnimationFrame=formerCancel;}
});
