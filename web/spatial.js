// Spatial predicates for user-authored mechanical practice, evaluated using
// the actual pose and transform of the instrument part (not a UI label).
import {assemblyRoot,partMatrix,transformPoint} from './assembly.js';
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const HUMAN_ANCHORS={chest:[0,1.3,0],pelvis:[0,.91,0],head:[0,1.72,0],rightShoulder:[.25,1.38,0],leftShoulder:[-.25,1.38,0]};
const rotateYaw=(v,yaw)=>[Math.cos(yaw)*v[0]+Math.sin(yaw)*v[2],v[1],-Math.sin(yaw)*v[0]+Math.cos(yaw)*v[2]];
export const anchorPosition=(world,entity,anchorId,depth=0)=>{
 if(!entity||depth>8)return null;
 // An attached instrument inherits its parent's physical anchor position.
 if(entity.attachedTo){
  const target=world.scene.entities.find(e=>e.id===entity.attachedTo);
  return anchorPosition(world,target,entity.anchor,depth+1);
 }
 if(entity.type==='character'){
  if(anchorId&&!Object.hasOwn(HUMAN_ANCHORS,anchorId))return null;
  const p=rotateYaw(HUMAN_ANCHORS[anchorId]||[0,0,0],entity.rotation?.[1]||0);
  return entity.position.map((v,i)=>v+p[i]);
 }
 const asset=world.assets?.find(a=>a.id===entity.assetId);
 let local=[0,0,0];
 if(anchorId){
  const anchor=asset?.anchors?.find(a=>a.id===anchorId);if(!anchor)return null;
  local=anchor.position;
  if(anchor.partId){
   const part=asset.parts.find(p=>p.id===anchor.partId);if(!part)return null;
   local=transformPoint(partMatrix(asset,entity,part),local);
  }
 }
 return transformPoint(assemblyRoot(entity),local);
};
export const spatialPredicate=(condition,world,entity)=>{
 if(!world?.scene?.entities||!entity||!condition)return false;
 const target=world.scene.entities.find(e=>e.id===condition.targetId);if(!target)return false;
 if(condition.kind==='distance'||condition.kind==='contact'){
  const a=anchorPosition(world,entity,condition.anchorId),b=anchorPosition(world,target,condition.targetAnchor);
  if(!a||!b)return false;
  const d=Math.hypot(...a.map((x,i)=>x-b[i]));
  return d<=(condition.maxDistance??(condition.kind==='contact'?.08:0));
 }
 if(condition.kind==='orientation'){
  const index=condition.axisIndex??1;
  const a=(entity.rotation||[0,0,0])[index],b=(target.rotation||[0,0,0])[index];
  if(!finite(a)||!finite(b))return false;
  const diff=Math.atan2(Math.sin(a-b),Math.cos(a-b));
  return Math.abs(diff)<=condition.maxAngle;
 }
 return false;
};
export const isSpatialCondition=c=>['distance','contact','orientation'].includes(c?.kind);
