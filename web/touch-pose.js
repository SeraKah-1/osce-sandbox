// One touch language for every renderer. Posing is projected into screen space,
// so no axis selector or slider is required. All edits remain ordinary scene operations.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointOnSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy||1,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0,1);return {x:a.x+t*dx,y:a.y+t*dy};};
const limits={shoulderFlexion:[-150,170],shoulderAbduction:[-165,165],elbowFlexion:[-8,155],hipFlexion:[-135,95],hipAbduction:[-75,75],kneeFlexion:[-8,155]};
const findPoseAxis=(key,axis)=>key.endsWith('Shoulder')?limits[axis==='flexion'?'shoulderFlexion':'shoulderAbduction']:
 key.endsWith('Elbow')?limits.elbowFlexion:key.endsWith('Hip')?limits[axis==='flexion'?'hipFlexion':'hipAbduction']:limits.kneeFlexion;
const jointKeys=(side,limb,target)=>{const upper=side+(limb==='arm'?'Shoulder':'Hip'),middle=side+(limb==='arm'?'Elbow':'Knee');const keys=[[upper,'flexion'],[upper,'abduction']];if(target==='end')keys.push([middle,'flexion']);return keys;};
export function solveScreenPose({entity,side,limb,targetPoint,aim,project,skeleton,iterations=12}){
 const keys=jointKeys(side,limb,targetPoint==='end'?'end':'middle');
 const endpoint=side+(limb==='arm'?(targetPoint==='end'?'Wrist':'Elbow'):(targetPoint==='end'?'Ankle':'Knee'));
 const current=()=>project(skeleton(entity).joints[endpoint]);
 let error=Infinity;
 for(let pass=0;pass<iterations;pass++){
   const origin=current();if(!origin.visible)break;
   const ex=aim.x-origin.x,ey=aim.y-origin.y;error=Math.hypot(ex,ey);if(error<1.2)break;
   const jac=[];
   for(const [joint,axis] of keys){const old=entity.pose[joint]?.[axis];if(!Number.isFinite(old)){jac.push([0,0]);continue;}
     const delta=1;entity.pose[joint][axis]=clamp(old+delta,...findPoseAxis(joint,axis));const next=current();entity.pose[joint][axis]=old;const change=entity.pose[joint][axis]===undefined?0:Math.max(.001,clamp(old+delta,...findPoseAxis(joint,axis))-old);jac.push([(next.x-origin.x)/change,(next.y-origin.y)/change]);}
   let xx=8,xy=0,yy=8;for(const [jx,jy] of jac){xx+=jx*jx;xy+=jx*jy;yy+=jy*jy;}
   const det=xx*yy-xy*xy;if(det<.00001)break;
   const vx=(yy*ex-xy*ey)/det,vy=(xx*ey-xy*ex)/det;
   for(let i=0;i<keys.length;i++){const [joint,axis]=keys[i],old=entity.pose[joint][axis];const step=clamp(jac[i][0]*vx+jac[i][1]*vy,-13,13);entity.pose[joint][axis]=clamp(old+step,...findPoseAxis(joint,axis));}
 }
 return {error,changes:keys.map(([joint,axis])=>({joint,axis,angle:Math.round(entity.pose[joint][axis]*100)/100}))};
}
export function hitTestPuppet(world,project,skeleton,assetPosition,pointer){
 if(!world?.scene?.entities)return null;
 const candidates=[];
 const push=(entityId,kind,p,priority,target=null,rawWorld=null)=>{if(!p?.visible||p.z>=1)return;const d=distance(p,pointer);const radius=kind==='move-character'?36:kind==='pose'?31:kind==='move-asset'?43:32;
   if(d<=radius)candidates.push({entityId,kind,target,d,score:d-priority,world:rawWorld});};
 for(const e of world.scene.entities){
  if(e.type==='character'){
   const J=skeleton(e).joints;const P=Object.fromEntries(Object.entries(J).map(([k,p])=>[k,project(p)]));
   // End-effectors have first pick priority: a user can grab hands/feet before selecting the puppet.
   for(const side of ['right','left']){
    for(const [joint,limb,target] of [[side+'Wrist','arm','end'],[side+'Elbow','arm','middle'],[side+'Ankle','leg','end'],[side+'Knee','leg','middle']])
      push(e.id,'pose',P[joint],15,{side,limb,target,joint},J[joint]);
    for(const [a,b,limb,target] of [[side+'Shoulder',side+'Elbow','arm','middle'],[side+'Elbow',side+'Wrist','arm','end'],[side+'Hip',side+'Knee','leg','middle'],[side+'Knee',side+'Ankle','leg','end']]){
      if(!P[a]?.visible||!P[b]?.visible)continue;const q=pointOnSegment(pointer,P[a],P[b]),d=distance(pointer,q);
      if(d<22)candidates.push({entityId:e.id,kind:'pose',target:{side,limb,target,joint:b},d,score:d+8,world:J[b]});
    }
   }
   for(const j of ['chest','hip','neck','head'])push(e.id,'move-character',P[j],5,null,J[j]);
   if(P.hip?.visible&&P.chest?.visible){const q=pointOnSegment(pointer,P.hip,P.chest),d=distance(pointer,q);if(d<33)candidates.push({entityId:e.id,kind:'move-character',d,score:d-5,world:J.chest});}
  }else{const pos=assetPosition(e);push(e.id,'move-asset',project(pos),6,null,pos);}
 }
 candidates.sort((a,b)=>a.score-b.score||a.d-b.d);return candidates[0]||null;
}
export function dragOnGround({origin,delta,project,pointHeight=1}){
 const center=project([origin[0],pointHeight,origin[2]]),xp=project([origin[0]+.35,pointHeight,origin[2]]),zp=project([origin[0],pointHeight,origin[2]+.35]);
 const ax=(xp.x-center.x)/.35,ay=(xp.y-center.y)/.35,bx=(zp.x-center.x)/.35,by=(zp.y-center.y)/.35;
 const det=ax*by-ay*bx;
 if(Math.abs(det)<.005)return [...origin];
 const moveX=(by*delta.x-bx*delta.y)/det,moveZ=(ax*delta.y-ay*delta.x)/det;
 return [clamp(origin[0]+moveX,-12,12),origin[1],clamp(origin[2]+moveZ,-12,12)];
}
// Input owner: a gesture belongs to the puppet, prop or camera until every finger is lifted.
// Two fingers always control the camera; adding a finger rolls back unsaved puppet edits.
export function installDirectTouch({canvas,getWorld,project,skeleton,assetPosition,camera,onSelect,onPreview,onCommit,onGesture}){
 const pointers=new Map();let gesture=null;const coordinate=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const revert=g=>{if(!g?.origin)return;const entity=getWorld()?.scene.entities.find(x=>x.id===g.hit?.entityId);if(!entity)return;entity.position=[...g.origin.position];if(g.origin.pose)entity.pose=structuredClone(g.origin.pose);onPreview?.(entity,g.hit,null,true);};
 const begin=(e)=>{try{canvas.setPointerCapture(e.pointerId);}catch{} const p=coordinate(e);pointers.set(e.pointerId,p);
   if(pointers.size>1){revert(gesture);onGesture?.('camera');const ps=[...pointers.values()];gesture={kind:'multitouch',distance:Math.hypot(ps[0].x-ps[1].x,ps[0].y-ps[1].y),center:{x:(ps[0].x+ps[1].x)/2,y:(ps[0].y+ps[1].y)/2}};return;}
   const world=getWorld(),hit=hitTestPuppet(world,project,skeleton,assetPosition,p);const entity=world?.scene.entities.find(x=>x.id===hit?.entityId);
   if(hit)onSelect?.(hit.entityId,hit.kind==='pose'?hit.target.joint:null);
   gesture={kind:hit?.kind||'orbit',hit,baseRevision:world?.scene.revision,initial:p,last:p,moved:false,origin:entity?{position:[...entity.position],pose:entity.type==='character'?structuredClone(entity.pose):null,rotation:[...(entity.rotation||[0,0,0])]}:null,
     aim:hit?.world?project(hit.world):p};onGesture?.('start',hit);
 };
 const move=e=>{if(!pointers.has(e.pointerId)||!gesture)return;const p=coordinate(e);pointers.set(e.pointerId,p);const g=gesture;
   if(pointers.size>1){const pts=[...pointers.values()],dist=Math.max(12,Math.hypot(pts[0].x-pts[1].x,pts[0].y-pts[1].y)),center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
     if(g.kind!=='multitouch'){revert(g);gesture={kind:'multitouch',distance:dist,center};return;}
     camera.distance=clamp(camera.distance*g.distance/dist,2.1,16);const s=camera.distance*.0017;camera.target[0]-=(center.x-g.center.x)*s;camera.target[2]+=(center.y-g.center.y)*s;g.distance=dist;g.center=center;return;}
   if(g.kind==='multitouch')return;
   const dx=p.x-g.last.x,dy=p.y-g.last.y,delta={x:p.x-g.initial.x,y:p.y-g.initial.y};g.last=p;
   if(Math.hypot(delta.x,delta.y)>4)g.moved=true;
   if(g.kind==='orbit'){camera.azimuth-=dx*.007;camera.elevation=clamp(camera.elevation+dy*.007,-.05,1.45);return;}
   if(!g.moved||!g.hit||!g.origin)return;
   const ent=getWorld()?.scene.entities.find(x=>x.id===g.hit.entityId);if(!ent)return;
   if(g.kind==='pose'){const target={x:g.aim.x+delta.x,y:g.aim.y+delta.y};const result=solveScreenPose({entity:ent,side:g.hit.target.side,limb:g.hit.target.limb,targetPoint:g.hit.target.target,aim:target,project,skeleton});g.ikError=result.error;}
   else if(!ent.attachedTo){ent.position=dragOnGround({origin:g.origin.position,delta,project,pointHeight:g.kind==='move-character'?1.15:g.origin.position[1]});}
   onPreview?.(ent,g.hit,g);
 };
 const finish=e=>{if(!pointers.has(e.pointerId))return;const cancelled=e.type!=='pointerup';pointers.delete(e.pointerId);const g=gesture;if(cancelled){pointers.clear();revert(g);gesture=null;onGesture?.('cancel');return;}
   if(pointers.size)return;
   gesture=null;onGesture?.('end',g?.hit);
   if(!g?.moved||!g.hit||!g.origin||g.kind==='orbit'||g.kind==='multitouch')return;
   const eNow=getWorld()?.scene.entities.find(x=>x.id===g.hit.entityId);if(!eNow)return;
   const ops=[];
   if(g.kind==='pose'){
     for(const [joint,axes] of Object.entries(eNow.pose)){
       for(const [axis,value] of Object.entries(axes)){
         if(Math.abs(value-(g.origin.pose[joint]?.[axis]??0))>.15){
           ops.push({type:'set_joint',entityId:eNow.id,joint,axis,angle:Math.round(value*100)/100});
         }
       }
     }
   }else if(!eNow.attachedTo&&eNow.position.some((x,i)=>Math.abs(x-g.origin.position[i])>.0001)){
     ops.push({type:'move_entity',entityId:eNow.id,position:[...eNow.position]});
   }
   if(ops.length)onCommit?.(ops,eNow,g);
   else revert(g);
 };
 canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',finish);canvas.addEventListener('pointercancel',finish);canvas.addEventListener('lostpointercapture',finish);
 const wheel=e=>{e.preventDefault();camera.distance=clamp(camera.distance*(e.deltaY>0?1.09:.91),2.1,16)};canvas.addEventListener('wheel',wheel,{passive:false});
 return {destroy(){if(gesture){revert(gesture);gesture=null;pointers.clear();onGesture?.('cancel');}canvas.removeEventListener('pointerdown',begin);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',finish);canvas.removeEventListener('pointercancel',finish);canvas.removeEventListener('lostpointercapture',finish);canvas.removeEventListener('wheel',wheel);},active(){return !!gesture&&gesture.kind!=='orbit';}};
}
