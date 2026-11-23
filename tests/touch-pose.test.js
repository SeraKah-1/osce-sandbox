import test from 'node:test';
import assert from 'node:assert/strict';
import {hitTestPuppet,dragOnGround} from '../web/touch-pose.js';
import {characterSkeleton} from '../web/render3d.js';
import {Studio} from '../server/core.js';

const project=p=>({x:320+p[0]*115+p[2]*37,y:190-p[1]*119+p[2]*58,z:.2,visible:true});
function patient(){return structuredClone(new Studio().scene.entities.find(e=>e.id==='patient'));}

test('selectable body root, limb and asset all work without mode selection',()=>{
 const w=new Studio();const e=w.scene.entities.find(x=>x.id==='patient');const sk=characterSkeleton(e).joints;
 const wrist=project(sk.rightWrist);
 const a=hitTestPuppet(w,project,characterSkeleton,x=>x.position,wrist);
 assert.equal(a.entityId,'patient');assert.equal(a.kind,'pose');
 const chest=project(sk.chest);
 const b=hitTestPuppet(w,project,characterSkeleton,x=>x.position,chest);
 assert.equal(b.entityId,'patient');assert.equal(b.kind,'move-character');
 const prop=w.scene.entities.find(x=>x.type==='asset');const c=hitTestPuppet(w,project,characterSkeleton,x=>x.position,project(prop.position));
 assert.equal(c.entityId,prop.id);assert.equal(c.kind,'move-asset');
});

test('drag entire patient on ground keeps height and translates XZ',()=>{
 const e=patient(),p=dragOnGround({origin:e.position,delta:{x:115,y:25},project});
 assert.equal(p[1],e.position[1]);assert.ok(Number.isFinite(p[0])&&Number.isFinite(p[2]));assert.ok(Math.hypot(p[0]-e.position[0],p[2]-e.position[2])>.1);
});

// Synthetic PointerEvents exercise the same direct-touch controller used by WebGL and Canvas2D.
import {installDirectTouch} from '../web/touch-pose.js';
function pointerHarness(){
 const studio=new Studio();const world=studio.snapshot();const canvas=new EventTarget();canvas.getBoundingClientRect=()=>({left:0,top:0});canvas.setPointerCapture=()=>{};
 const commits=[],camera={azimuth:.65,elevation:.45,distance:6,target:[0,1,0]};
 let selected=null;
 const control=installDirectTouch({canvas,getWorld:()=>world,project,skeleton:characterSkeleton,assetPosition:e=>e.position,camera,
  onSelect:(id,joint)=>selected={id,joint},onCommit:ops=>commits.push(ops)});
 const send=(type,id,x,y)=>{const ev=new Event(type);Object.assign(ev,{pointerId:id,clientX:x,clientY:y});canvas.dispatchEvent(ev);};
 return {world,canvas,commits,camera,send,control,getSelected:()=>selected};
}

test('single-finger wrist drag commits one atomic pose transaction',()=>{
 const h=pointerHarness(),ent=h.world.scene.entities.find(x=>x.id==='patient');const p=project(characterSkeleton(ent).joints.rightWrist);
 h.send('pointerdown',1,p.x,p.y);h.send('pointermove',1,p.x-51,p.y-36);h.send('pointerup',1,p.x-51,p.y-36);
 assert.equal(h.commits.length,1);assert.ok(h.commits[0].every(op=>op.type==='set_joint'));
 assert.ok(h.commits[0].length>=1);h.control.destroy();
});

test('second finger preserves and commits a pose before switching to camera',()=>{
 const h=pointerHarness(),ent=h.world.scene.entities.find(x=>x.id==='patient'),initial=structuredClone(ent.pose),p=project(characterSkeleton(ent).joints.rightWrist);
 h.send('pointerdown',1,p.x,p.y);h.send('pointermove',1,p.x-55,p.y-41);h.send('pointerdown',2,p.x+96,p.y+34);
 assert.notDeepEqual(ent.pose,initial);
 assert.equal(h.commits.length,1);
 const poseAfter=structuredClone(ent.pose);
 h.send('pointermove',2,p.x+106,p.y+44);h.send('pointerup',2,p.x+106,p.y+44);h.send('pointerup',1,p.x-55,p.y-41);
 assert.deepEqual(ent.pose,poseAfter);
 assert.equal(h.commits.length,1);h.control.destroy();
});

test('pointercancel reverts the patient position and does not save',()=>{
 const h=pointerHarness(),ent=h.world.scene.entities.find(x=>x.id==='patient'),initial=[...ent.position],p=project(characterSkeleton(ent).joints.chest);
 h.send('pointerdown',1,p.x,p.y);h.send('pointermove',1,p.x+120,p.y+21);
 assert.notDeepEqual(ent.position,initial);h.send('pointercancel',1,p.x+120,p.y+21);
 assert.deepEqual(ent.position,initial);assert.equal(h.commits.length,0);h.control.destroy();
});

test('posing a supported patient changes joints without detaching them from the bed',()=>{
 const h=pointerHarness(),ent=h.world.scene.entities.find(x=>x.id==='patient');
 ent.supportedBy={entityId:'bed-1',affordanceId:'lie',kind:'bed'};
 const p=project(characterSkeleton(ent).joints.rightWrist);
 h.send('pointerdown',1,p.x,p.y);
 h.send('pointermove',1,p.x-51,p.y-36);
 h.send('pointerup',1,p.x-51,p.y-36);
 assert.equal(h.commits.length,1);
 assert.ok(h.commits[0].every(op=>op.type==='set_joint'));
 assert.equal(ent.supportedBy.entityId,'bed-1');
 h.control.destroy();
});
