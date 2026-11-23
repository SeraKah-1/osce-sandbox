// Metadata-driven, deterministic placement shared by browser and Node/MCP.
// No physics simulation and no asset-name assumptions: custom AI assets can
// advertise seat / bed / surface affordances without changing application code.
const distanceXZ=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const rotate=(p,yaw)=>[Math.cos(yaw)*p[0]+Math.sin(yaw)*p[2],p[1],-Math.sin(yaw)*p[0]+Math.cos(yaw)*p[2]];
const finite=x=>typeof x==='number'&&Number.isFinite(x);
export const affordancesFor=(world,asset)=>world?.assets?.find(a=>a.id===asset?.assetId)?.affordances||[];
export const supportAnchor=(world,support,affordance)=>{
 const asset=world?.assets?.find(a=>a.id===support.assetId);
 const anchor=asset?.anchors?.find(a=>a.id===affordance.anchor);
 if(!anchor)return null;
 const p=rotate(anchor.position,support.rotation?.[1]||0);
 return support.position.map((v,i)=>v+p[i]);
};
export function characterPlacement(world,character,support,affordance){
 if(character?.type!=='character'||support?.type!=='asset'||!['seat','bed'].includes(affordance?.kind))return null;
 const center=supportAnchor(world,support,affordance);if(!center)return null;
 const yaw=(support.rotation?.[1]||0)+(affordance.yawOffset||0);
 const lying=affordance.kind==='bed';
 const pose=affordance.pose||(lying?'lying':'sitting');
 if(!world.poses?.[pose])return null;
 return {supportId:support.id,affordanceId:affordance.id,kind:affordance.kind,supportName:support.name,
  position:[center[0],center[1]-.95+(affordance.heightOffset??(lying?.18:0)),center[2]],
  rotation:[lying?Math.PI/2:0,yaw,0],pose,center,radius:affordance.radius||.75};
}
export function characterPlacementCandidate(world,character,position,previous=null){
 if(!world?.scene?.entities||character?.type!=='character')return null;
 let best=null,held=null;
 for(const support of world.scene.entities){
  if(support.type!=='asset'||support.id===character.id)continue;
  for(const affordance of affordancesFor(world,support)){
   if(!['seat','bed'].includes(affordance.kind))continue;
   const option=characterPlacement(world,character,support,affordance);if(!option)continue;
   const d=distanceXZ(position,option.center);
   const same=previous?.supportId===support.id&&previous?.affordanceId===affordance.id;
   if(d>option.radius*(same?1.16:1))continue;
   const cost=d/option.radius;
   const candidate={...option,cost,distance:d};
   if(same)held=candidate;
   if(!best||cost<best.cost)best=candidate;
  }
 }
 return held&&(!best||held.cost<=best.cost+.16)?held:best;
}
// Backwards compatible API for older consumer paths.
export function chairCandidate(world,position){
 return characterPlacementCandidate(world,{type:'character'},position);
}
const minBottom=blueprint=>Math.min(...(blueprint.parts||[]).map(p=>p.position[1]-p.size[1]*.5));
export function surfacePosition(world,entity,support,affordance,localOffset=[0,0,0]){
 const blueprint=world.assets.find(a=>a.id===entity.assetId);
 const center=supportAnchor(world,support,affordance);
 if(!center||!blueprint?.parts?.length)return null;
 const offset=rotate([localOffset[0],0,localOffset[2]],support.rotation?.[1]||0);
 return [center[0]+offset[0],center[1]-minBottom(blueprint)+.012+(localOffset[1]||0),center[2]+offset[2]];
}
export function surfaceCandidate(world,entity,position,previous=null){
 if(!world||entity?.type!=='asset'||entity.attachedTo||affordancesFor(world,entity).length)return null;
 let best=null,held=null;
 for(const support of world.scene.entities){
  if(support.type!=='asset'||support.id===entity.id)continue;
  for(const a of affordancesFor(world,support)){
   if(a.kind!=='surface')continue;
   const center=supportAnchor(world,support,a);if(!center)continue;
   const yaw=-(support.rotation?.[1]||0),delta=[position[0]-center[0],0,position[2]-center[2]],local=rotate(delta,yaw);
   const [hx,hz]=(a.halfExtents||[.4,.4]);
   const same=previous?.supportId===support.id&&previous?.affordanceId===a.id;
   const margin=same?.17:.08;
   if(Math.abs(local[0])>hx+margin||Math.abs(local[2])>hz+margin)continue;
   if(Math.abs(position[1]-center[1])>1.6)continue;
   const pos=surfacePosition(world,entity,support,a,[local[0],0,local[2]]);
   if(!pos)continue;
   const cost=Math.abs(position[1]-pos[1])*.2+distanceXZ(position,center)*.1;
   const candidate={supportId:support.id,affordanceId:a.id,supportName:support.name,
    position:pos,localOffset:[local[0],0,local[2]],cost};
   if(same)held=candidate;
   if(!best||cost<best.cost)best=candidate;
  }
 }
 return held&&(!best||held.cost<=best.cost+.10)?held:best;
}
export const placementCandidate=surfaceCandidate;
export function reflowSupported(world,supportId,yawDelta=0,visited=new Set()){
 if(visited.has(supportId))return [];
 visited.add(supportId);
 const support=world.scene.entities.find(e=>e.id===supportId);
 if(!support)return [];
 const changed=[];
 for(const item of world.scene.entities){
  if(item.supportedBy?.entityId===supportId&&item.type==='character'){
   const a=affordancesFor(world,support).find(v=>v.id===item.supportedBy.affordanceId);
   const candidate=characterPlacement(world,item,support,a);
   if(!candidate)continue;
   item.position=candidate.position;item.rotation=candidate.rotation;
   changed.push(item.id);
  }
  if(item.restingOn?.entityId===supportId&&item.type==='asset'){
   const a=affordancesFor(world,support).find(v=>v.id===item.restingOn.affordanceId&&v.kind==='surface');
   if(!a)continue;
   const p=surfacePosition(world,item,support,a,item.restingOn.localOffset);
   if(p){
    item.position=p;
    if(yawDelta){
     const yaw=item.rotation[1]+yawDelta;
     item.rotation[1]=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    }
    changed.push(item.id,...reflowSupported(world,item.id,yawDelta,visited));
   }
  }
 }
 return changed;
}
