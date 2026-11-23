import test from 'node:test';
import assert from 'node:assert/strict';
import {Studio} from '../server/core.js';
import {characterSkeleton} from '../web/render3d.js';
import {solveTwoBone3D,limbSpec,choosePole,projectedDragTarget,screenRay,intersectRayPlane,len3,sub3} from '../web/ik3d.js';
import {chairCandidate,placementCandidate} from '../web/placement.js';
const patient=()=>structuredClone(new Studio().scene.entities.find(e=>e.id==='patient'));
const close=(a,b,eps=.00001)=>Math.abs(a-b)<eps;
const displacement=[[.12,.11,-.11],[-.17,.18,-.07],[.19,.15,-.14],[-.12,.10,-.09]];

test('analytic 3D IK reaches both hands and both ankles while preserving lengths',()=>{
 for(const [i,[side,limb]] of [['right','arm'],['left','arm'],['right','leg'],['left','leg']].entries()){
  const e=patient(),start=limbSpec(e,side,limb,characterSkeleton),
   target=start.C.map((v,k)=>v+displacement[i][k]);
  const result=solveTwoBone3D({entity:e,side,limb,target,skeleton:characterSkeleton});
  const after=limbSpec(e,side,limb,characterSkeleton);
  assert.ok(result.error<.001,`${side} ${limb} error ${result.error}`);
  assert.ok(close(after.l1,start.l1)&&close(after.l2,start.l2));
  assert.ok(Object.values(e.pose).flatMap(Object.values).every(Number.isFinite));
 }
});

test('3D IK responds coherently to rotating the character, not camera projection',()=>{
 const a=patient(),b=patient();b.rotation[1]+=Math.PI/2;
 const sa=limbSpec(a,'right','arm',characterSkeleton),sb=limbSpec(b,'right','arm',characterSkeleton);
 const local=[.13,.18,-.15],rot=b.rotation[1]-a.rotation[1];
 const rotated=[local[0]*Math.cos(rot)+local[2]*Math.sin(rot),local[1],-local[0]*Math.sin(rot)+local[2]*Math.cos(rot)];
 const pa=sa.C.map((v,k)=>v+local[k]),pb=sb.C.map((v,k)=>v+rotated[k]);
 const ra=solveTwoBone3D({entity:a,side:'right',limb:'arm',target:pa,skeleton:characterSkeleton});
 const rb=solveTwoBone3D({entity:b,side:'right',limb:'arm',target:pb,skeleton:characterSkeleton});
 assert.ok(ra.error<.001&&rb.error<.001);for(const axis of ['flexion','abduction','rotation'])assert.ok(close(a.pose.rightShoulder[axis],b.pose.rightShoulder[axis],.001),axis);
});

test('out-of-reach target cannot stretch bones or produce NaN',()=>{
 const e=patient(),spec=limbSpec(e,'right','arm',characterSkeleton),target=[10,10,10];
 const r=solveTwoBone3D({entity:e,side:'right',limb:'arm',target,skeleton:characterSkeleton});
 const after=limbSpec(e,'right','arm',characterSkeleton);
 assert.equal(r.constrained,true);assert.ok(after.l1+after.l2<.75+1e-3);
 assert.ok(Number.isFinite(r.error)&&r.error>1);
});

test('elbow direct manipulation keeps forearm joint legal and stable',()=>{
 const e=patient(),before=limbSpec(e,'right','arm',characterSkeleton),theta=.20,v=sub3(before.B,before.A),target=[before.A[0]+v[0],before.A[1]+v[1]*Math.cos(theta)-v[2]*Math.sin(theta),before.A[2]+v[1]*Math.sin(theta)+v[2]*Math.cos(theta)];
 const r=solveTwoBone3D({entity:e,side:'right',limb:'arm',target,targetPoint:'middle',skeleton:characterSkeleton});
 assert.ok(r.error<.002);assert.equal(e.pose.rightElbow.flexion,0);
});

test('camera screen ray intersects its target, and ray-plane dragging is reversible',()=>{
 const camera={azimuth:.75,elevation:.5,distance:6,target:[0,1,0]};
 const center={x:450,y:325},a={x:480,y:295},settings={camera,width:900,height:650};
 const ray=screenRay({pointer:center,...settings});
 const point=intersectRayPlane(ray,camera.target,ray.front);
 assert.ok(len3(sub3(point,camera.target))<1e-8);
 const target=projectedDragTarget({initial:center,current:a,worldPoint:[.3,.8,.2],...settings});
 const back=projectedDragTarget({initial:a,current:center,worldPoint:target,...settings});
 assert.ok(len3(sub3(back,[.3,.8,.2]))<1e-6);
});

test('surface snap only happens near valid furniture, on release',()=>{
 const world=new Studio().snapshot();
 const e={id:'temp',type:'asset',assetId:'goniometer',position:[-2.18,0,-1.53]};
 const snap=placementCandidate(world,e,e.position);
 assert.ok(snap);assert.equal(snap.supportId,'table-1');assert.ok(snap.position[1]>.75);
 assert.equal(placementCandidate(world,e,[8,0,8]),null);
 assert.equal(placementCandidate(world,{...e,attachedTo:'doctor'},e.position),null);
});

test('chair snap has explicit seat offset, not arbitrary character teleport',()=>{
 const w=new Studio();w.apply([{type:'spawn_asset',assetId:'chair',id:'chair-test',position:[0,0,0]}],0);
 const s=chairCandidate(w.snapshot(),[.1,0,.1]);
 assert.equal(s.supportId,'chair-test');assert.ok(close(s.position[1],-.43,.001));
 assert.equal(chairCandidate(w.snapshot(),[3,0,3]),null);
});

test('ChatGPT widget embeds 3D IK, placement and touch modules as executable JS',async()=>{
 const {widgetHTML}=await import('../server/widget.js');const {Script}=await import('node:vm');
 const html=widgetHTML();const match=html.match(/<script>([\s\S]*?)<\/script>/);
 assert.ok(match,'inline MCP App script must exist');
 assert.ok(match[1].includes('solveTwoBone3D')&&match[1].includes('placementCandidate'));
 assert.doesNotMatch(match[1],/\bimport\s*\{/);
 assert.doesNotMatch(match[1],/\bexport\s+(function|const)/);
 assert.doesNotThrow(()=>new Script(match[1]));
});

test('hip rotation is part of server-authorized pose and survives sitting preset',()=>{
 const studio=new Studio();
 studio.apply([{type:'apply_pose',entityId:'patient',presetId:'sitting'}],0);
 assert.equal(studio.scene.entities.find(e=>e.id==='patient').pose.rightHip.rotation,0);
 studio.apply([{type:'set_joint',entityId:'patient',joint:'rightHip',axis:'rotation',angle:37}],1);
 assert.equal(studio.scene.entities.find(e=>e.id==='patient').pose.rightHip.rotation,37);
});
