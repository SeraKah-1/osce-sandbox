import {solveTwoBone3D,limbSpec,choosePole,screenRay,projectedDragTarget,intersectRayPlane,add3,sub3} from './ik3d.js';
import {mechanismHandle,mechanismNextValue} from './assembly.js';
import {placementCandidate,characterPlacementCandidate,affordancesFor,reflowSupported} from './placement.js';
// One touch language for every renderer. Posing is projected into screen space,
// so no axis selector or slider is required. All edits remain ordinary scene operations.
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const distance=(a,b)=>Math.hypot(a.x-b.x,a.y-b.y);
const pointOnSegment=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,d=dx*dx+dy*dy||1,t=clamp(((p.x-a.x)*dx+(p.y-a.y)*dy)/d,0,1);return {x:a.x+t*dx,y:a.y+t*dy};};
export function rotationHandle(world,project,skeleton,assetPosition,selectedId){
 const e=world?.scene?.entities?.find(x=>x.id===selectedId);
 if(!e||(e.type==='asset'&&world.assets.find(a=>a.id===e.assetId)?.movable===false))return null;
 const anchor=e.type==='character'?skeleton(e).joints.head:[...assetPosition(e)];
 if(e.type==='asset'){const a=world.assets.find(a=>a.id===e.assetId);anchor[1]+=Math.max(.35,...(a?.parts||[]).map(p=>p.position[1]+p.size[1]*.5));}
 const pos=project(anchor);
 if(!pos?.visible||pos.z>=1)return null;
 return {x:pos.x+48,y:pos.y-25,z:pos.z,entityId:e.id,world:anchor,visible:true};
}
export function hitTestPuppet(world,project,skeleton,assetPosition,pointer,detailSelection=null,rotationSelection=null){
 if(!world?.scene?.entities)return null;
 const candidates=[];
 const rotate=rotationHandle(world,project,skeleton,assetPosition,rotationSelection);
 if(rotate&&distance(rotate,pointer)<31)return {entityId:rotate.entityId,kind:'rotate-entity',d:distance(rotate,pointer),score:-100,world:rotate.world};
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
  }else{
   const defForDetail=world.assets.find(a=>a.id===e.assetId);
   if(detailSelection===e.id)for(const m of defForDetail?.mechanisms||[]){
      const handle=mechanismHandle(defForDetail,e,m,assetPosition(e));
      push(e.id,'micro',project(handle),26,{mechanismId:m.id},handle);
   }
   if(defForDetail?.movable===false)continue;
   const pos=assetPosition(e),p=project(pos);push(e.id,'move-asset',p,6,null,pos);
   const def=world.assets.find(a=>a.id===e.assetId),yaw=e.rotation?.[1]||0;
   if(!def?.parts?.length)continue;
   // A furniture object can be grabbed anywhere on its visible 3D silhouette,
   // not only in a 43px circle around its origin.
   const px=[];
   for(const part of def.parts){
     const [sx,sy,sz]=part.size;
     for(const ax of [-.5,.5])for(const ay of [-.5,.5])for(const az of [-.5,.5]){
       const x=part.position[0]+sx*ax,z=part.position[2]+sz*az;
       const raw=[pos[0]+Math.cos(yaw)*x+Math.sin(yaw)*z,pos[1]+part.position[1]+sy*ay,pos[2]-Math.sin(yaw)*x+Math.cos(yaw)*z];
       const cp=project(raw);if(cp?.visible&&cp.z<1)px.push(cp);
     }
   }
   if(px.length){const left=Math.min(...px.map(q=>q.x))-6,right=Math.max(...px.map(q=>q.x))+6,top=Math.min(...px.map(q=>q.y))-6,bottom=Math.max(...px.map(q=>q.y))+6;
     const dx=Math.max(left-pointer.x,0,pointer.x-right),dy=Math.max(top-pointer.y,0,pointer.y-bottom);
     const dist=Math.hypot(dx,dy);
     if(dist<12)candidates.push({entityId:e.id,kind:'move-asset',target:null,d:dist,score:dist+3+Math.min(7,distance(p,pointer)*.016),world:pos});
   }
  }
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
// Direct-touch contract: one finger manipulates a body/prop or orbits empty
// space. A second finger FREEZES and commits the current pose, then takes over
// the camera. It never silently rolls the puppet back.
export function installDirectTouch({canvas,getWorld,project,skeleton,assetPosition,camera,getDetailSelection=()=>null,getRotationSelection=()=>null,onSelect,onPreview,onCommit,onGesture,onPreviewMechanism,onPreviewRotation}){
 const pointers=new Map();let gesture=null;
 const clearHold=g=>{if(g?.holdTimer){clearTimeout(g.holdTimer);g.holdTimer=null;}};
 const coordinate=e=>{const r=canvas.getBoundingClientRect();return {x:e.clientX-r.left,y:e.clientY-r.top};};
 const viewport=()=>({width:canvas.clientWidth||900,height:canvas.clientHeight||650});
 const raf=typeof requestAnimationFrame==='function'?requestAnimationFrame:null;
 const caf=typeof cancelAnimationFrame==='function'?cancelAnimationFrame:null;
 const cancelFrame=g=>{clearHold(g);if(g?.frame&&caf)caf(g.frame);if(g){g.frame=null;g.pending=null;}};
 const resetProvisional=g=>{if(!g?.origin)return;const e=getWorld()?.scene.entities.find(e=>e.id===g.hit?.entityId);if(!e)return;
   e.position=[...g.origin.position];e.rotation=[...g.origin.rotation];if(g.origin.pose)e.pose=structuredClone(g.origin.pose);if(g.origin.controls)e.controls=structuredClone(g.origin.controls);
   if(g.origin.supportedBy)e.supportedBy=structuredClone(g.origin.supportedBy);else delete e.supportedBy;
   if(g.origin.restingOn)e.restingOn=structuredClone(g.origin.restingOn);else delete e.restingOn;
   if(e.type==='asset')reflowSupported(getWorld(),e.id);onPreview?.(e,g.hit,null,true);};
 const sceneEntity=g=>getWorld()?.scene.entities.find(e=>e.id===g?.hit?.entityId);
 const applyPose=(g,p)=>{
  if(!g||g.kind!=='pose')return;
  const e=sceneEntity(g);if(!e)return;
  const aim=projectedDragTarget({initial:g.initial,current:p,worldPoint:g.grabWorld,camera,...viewport()});
  const result=solveTwoBone3D({entity:e,side:g.hit.target.side,limb:g.hit.target.limb,
    target:aim,pole:g.pole,skeleton,targetPoint:g.hit.target.target});
  g.ikError=result.error;g.reachLimit=result.constrained;onPreview?.(e,g.hit,g);
 };
 const schedulePose=(g,p)=>{g.pending=p;
  if(g.frame)return;
  if(!raf){const latest=g.pending;g.pending=null;applyPose(g,latest);return;}
  g.frame=raf(()=>{g.frame=null;if(gesture!==g)return;const latest=g.pending;g.pending=null;if(latest)applyPose(g,latest);});
 };
 const applyMicro=(g,p,tap=false)=>{
   const e=sceneEntity(g);if(!e)return;
   const def=getWorld()?.assets.find(a=>a.id===e.assetId),m=def?.mechanisms?.find(m=>m.id===g.hit?.target?.mechanismId);
   if(!m)return;
   const base=g.origin.controls?.[m.id]??m.initial;
   const delta=m.kind==='slider'?(p.x-g.initial.x)*.0025:(p.x-g.initial.x)*.55+(g.initial.y-p.y)*.18;
   const next=mechanismNextValue(m,base,delta);
   if(!e.controls)e.controls={};
   e.controls[m.id]=m.kind==='button'?(tap?mechanismNextValue(m,base,0):base):next;
   if(Math.abs(e.controls[m.id]-base)>1e-6)g.moved=true;
   onPreviewMechanism?.(e.id,m,e.controls[m.id]);
 };
 const applyRotation=(g,p)=>{
   const e=sceneEntity(g);if(!e)return;
   const dx=p.x-g.initial.x,dy=p.y-g.initial.y;
   const rotation=[...g.origin.rotation];
   rotation[1]=clamp(rotation[1]-dx*.012,-6.283,6.283);
   rotation[0]=clamp(rotation[0]-dy*.008,-Math.PI,Math.PI);
   e.rotation=rotation;
   if(e.type==='character')delete e.supportedBy;
   if(e.type==='asset')reflowSupported(getWorld(),e.id);
   onPreviewRotation?.(e.id,rotation);
 };
 const originalPosition=(g,p,applySnap=false)=>{
  const e=sceneEntity(g);if(!e)return;
  const origin=g.origin.position;
  let next;
  if(g.kind==='move-character'){
    const start=[origin[0],1.15+origin[1],origin[2]];
    const ray0=screenRay({pointer:g.initial,camera,...viewport()}),ray1=screenRay({pointer:p,camera,...viewport()});
    const groundNormal=[0,1,0];const a=intersectRayPlane(ray0,start,groundNormal),b=intersectRayPlane(ray1,start,groundNormal);
    if(a&&b)next=[origin[0]+b[0]-a[0],origin[1],origin[2]+b[2]-a[2]];
    else next=dragOnGround({origin,delta:{x:p.x-g.initial.x,y:p.y-g.initial.y},project,pointHeight:1.15+origin[1]});
  }else{
    const anchor=g.grabWorld||origin;
    next=projectedDragTarget({initial:g.initial,current:p,worldPoint:anchor,camera,...viewport()});
    next=add3(origin,sub3(next,anchor));next[1]=origin[1];
    const snap=placementCandidate(getWorld(),e,next,g.snap);g.snap=snap;
    if(snap&&applySnap)next=snap.position;
  }
  e.position=[clamp(next[0],-12,12),clamp(next[1],-5,12),clamp(next[2],-12,12)];
  if(g.kind==='move-character'){
    g.characterSnap=characterPlacementCandidate(getWorld(),e,e.position,g.characterSnap);
    if(g.characterSnap&&applySnap){
      const c=g.characterSnap;e.position=[...c.position];e.rotation=[...c.rotation];
      e.pose=structuredClone(getWorld().poses[c.pose]);
      e.supportedBy={entityId:c.supportId,affordanceId:c.affordanceId,kind:c.kind};
    }else if(applySnap){
      delete e.supportedBy;
      if(g.origin.supportedBy){e.position[1]=0;e.rotation=[0,g.origin.rotation[1],0];e.pose=structuredClone(getWorld().poses.standing);}
      else {e.rotation=[...g.origin.rotation];if(g.origin.pose)e.pose=structuredClone(g.origin.pose);}
    }else{
      e.rotation=[...g.origin.rotation];if(g.origin.pose)e.pose=structuredClone(g.origin.pose);
    }
  }else{
    if(g.snap&&applySnap){e.restingOn={entityId:g.snap.supportId,affordanceId:g.snap.affordanceId,localOffset:[...g.snap.localOffset]};}
    else if(applySnap)delete e.restingOn;
    if(e.type==='asset')reflowSupported(getWorld(),e.id);
  }
  onPreview?.(e,g.hit,g);
 };
 const operations=g=>{
  if(!g?.moved||!g.hit||!g.origin)return [];
  if(g.kind==='micro'){
    const e=sceneEntity(g),id=g.hit?.target?.mechanismId;
    if(!e||!id||!Number.isFinite(e.controls?.[id]))return [];
    if(Math.abs(e.controls[id]-(g.origin.controls?.[id]??0))<1e-6)return [];
    return [{type:'set_mechanism',entityId:e.id,mechanismId:id,value:e.controls[id]}];
  }
  const e=sceneEntity(g);if(!e)return [];
  if(e.type==='character'&&g.kind==='move-character'&&e.supportedBy){
    return [{type:'place_character',entityId:e.id,supportId:e.supportedBy.entityId,affordanceId:e.supportedBy.affordanceId}];
  }
  if(e.type==='asset'&&g.kind==='move-asset'&&e.restingOn){
    return [{type:'place_asset',entityId:e.id,supportId:e.restingOn.entityId,affordanceId:e.restingOn.affordanceId,localOffset:[...e.restingOn.localOffset]}];
  }
  const out=[];
  const positionChanged=e.position.some((n,i)=>Math.abs(n-g.origin.position[i])>1e-4);
  if(g.kind!=='pose'&&(positionChanged||g.origin.supportedBy||g.origin.restingOn))out.push({type:'move_entity',entityId:e.id,position:[...e.position]});
  if(e.rotation.some((n,i)=>Math.abs(n-(g.origin.rotation?.[i]||0))>1e-4))out.push({type:'rotate_entity',entityId:e.id,rotation:[...e.rotation]});
  if(e.type==='character'&&g.origin.pose){
   if(g.origin.supportedBy&&!e.supportedBy){out.push({type:'apply_pose',entityId:e.id,presetId:'standing'});}
   else for(const [joint,axes] of Object.entries(e.pose))for(const [axis,angle] of Object.entries(axes)){
    if(Math.abs(angle-(g.origin.pose[joint]?.[axis]??0))>.025)out.push({type:'set_joint',entityId:e.id,joint,axis,angle:Math.round(angle*100)/100});
   }
  }
  return out;
 };
 const commit=g=>{if(!g||['orbit','multitouch'].includes(g.kind))return;
  cancelFrame(g);if(g.kind==='pose'&&g.moved&&g.last)applyPose(g,g.last);
  else if(g.moved&&['move-character','move-asset'].includes(g.kind)&&g.last)originalPosition(g,g.last,true);
  const ops=operations(g);
  if(ops.length)onCommit?.(ops,sceneEntity(g),g);
 };
 const cameraGesture=()=>{const ps=[...pointers.values()];return {kind:'multitouch',distance:Math.max(12,distance(ps[0],ps[1])),center:{x:(ps[0].x+ps[1].x)*.5,y:(ps[0].y+ps[1].y)*.5}};};
 const begin=e=>{
  try{canvas.setPointerCapture(e.pointerId);}catch{}
  const p=coordinate(e);pointers.set(e.pointerId,p);
  if(pointers.size>1){commit(gesture);gesture=cameraGesture();onGesture?.('camera');return;}
  const hit=hitTestPuppet(getWorld(),project,skeleton,assetPosition,p,getDetailSelection(),getRotationSelection());
  const ent=getWorld()?.scene.entities.find(x=>x.id===hit?.entityId);
  if(hit)onSelect?.(hit.entityId,hit.kind==='pose'?hit.target.joint:null);
  const origin=ent?{position:[...ent.position],pose:ent.type==='character'?structuredClone(ent.pose):null,controls:ent.type==='asset'?structuredClone(ent.controls||{}):null,rotation:[...ent.rotation],supportedBy:ent.supportedBy?structuredClone(ent.supportedBy):null,restingOn:ent.restingOn?structuredClone(ent.restingOn):null}:null;
  const g={kind:hit?.kind||'orbit',hit,initial:p,last:p,moved:false,origin,
    grabWorld:hit?.world?[...hit.world]:null,pole:null,frame:null,pending:null};
  // Rotation is explicit and discoverable, not a hidden 340ms hold gesture.
  if((g.kind==='move-character'||g.kind==='move-asset')&&ent&&e.pointerType==='mouse'&&e.button===2)g.kind='rotate-entity';
  if(g.kind==='pose'&&ent){const spec=limbSpec(ent,hit.target.side,hit.target.limb,skeleton);g.pole=choosePole(spec);}
  gesture=g;onGesture?.('start',hit,origin);if(g.kind==='rotate-entity')onGesture?.('rotate',hit);
 };
 const move=e=>{
  if(!pointers.has(e.pointerId)||!gesture)return;
  const p=coordinate(e);pointers.set(e.pointerId,p);const g=gesture;
  if(pointers.size>1){if(g.kind!=='multitouch'){commit(g);gesture=cameraGesture();onGesture?.('camera');return;}
    const pts=[...pointers.values()],dist=Math.max(12,distance(pts[0],pts[1]));
    const center={x:(pts[0].x+pts[1].x)/2,y:(pts[0].y+pts[1].y)/2};
    camera.distance=clamp(camera.distance*g.distance/dist,2.1,16);
    const pan=camera.distance*.0017,dx=center.x-g.center.x,dy=center.y-g.center.y;
    const az=camera.azimuth,el=camera.elevation;
    const right=[Math.cos(az),0,-Math.sin(az)],up=[-Math.sin(el)*Math.sin(az),Math.cos(el),-Math.sin(el)*Math.cos(az)];
    for(let i=0;i<3;i++)camera.target[i]+=(-right[i]*dx+up[i]*dy)*pan;
    g.distance=dist;g.center=center;return;
  }
  if(g.kind==='multitouch')return;
  const dx=p.x-g.last.x,dy=p.y-g.last.y;g.last=p;
  if(distance(p,g.initial)>3){g.moved=true;clearHold(g);}
  if(g.kind==='orbit'){camera.azimuth-=dx*.0064;camera.elevation=clamp(camera.elevation+dy*.0064,-.05,1.45);return;}
  if(!g.moved||!g.hit||!g.origin)return;
  if(g.kind==='pose')schedulePose(g,p);else if(g.kind==='micro')applyMicro(g,p);else if(g.kind==='rotate-entity')applyRotation(g,p);else if(!sceneEntity(g)?.attachedTo)originalPosition(g,p);
 };
 const finish=e=>{
  if(!pointers.has(e.pointerId))return;
  const g=gesture,p=coordinate(e),cancelled=e.type==='pointercancel';
  pointers.delete(e.pointerId);
  if(cancelled){if(g?.kind==='multitouch'){
      if(pointers.size){const rest=[...pointers.values()][0];gesture={kind:'orbit',initial:rest,last:rest,moved:false};return;}
      gesture=null;onGesture?.('end');return;
    }
    cancelFrame(g);resetProvisional(g);gesture=null;pointers.clear();onGesture?.('cancel');return;
  }
  if(g?.kind==='multitouch'&&pointers.size===1){const rest=[...pointers.values()][0];gesture={kind:'orbit',initial:rest,last:rest,moved:false};onGesture?.('camera');return;}
  if(pointers.size)return;
  gesture=null;
  if(g?.kind==='pose'&&g.moved){cancelFrame(g);applyPose(g,p);}
  else if(g?.kind==='micro'){const before=g.moved;applyMicro(g,p,!g.moved);if(!before&&g.moved)g.tapMicro=true;}
  else if(g?.kind==='rotate-entity'&&g.moved)applyRotation(g,p);
  else if(g?.moved&&g.kind!=='orbit')originalPosition(g,p,true);
  commit(g);onGesture?.('end',g?.hit);
 };
 const wheel=e=>{e.preventDefault();camera.distance=clamp(camera.distance*(e.deltaY>0?1.075:.93),2.1,16);};
 const handleBlur=()=>{cancelFrame(gesture);resetProvisional(gesture);pointers.clear();gesture=null;onGesture?.('cancel');};
 if(canvas.style)canvas.style.touchAction='none';
 canvas.addEventListener('pointerdown',begin);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',finish);
 const preventContext=e=>e.preventDefault();canvas.addEventListener('contextmenu',preventContext);
 canvas.addEventListener('pointercancel',finish);canvas.addEventListener('wheel',wheel,{passive:false});
 globalThis.window?.addEventListener?.('blur',handleBlur);
 return {destroy(){cancelFrame(gesture);canvas.removeEventListener('pointerdown',begin);canvas.removeEventListener('pointermove',move);canvas.removeEventListener('pointerup',finish);canvas.removeEventListener('pointercancel',finish);canvas.removeEventListener('contextmenu',preventContext);canvas.removeEventListener('wheel',wheel);globalThis.window?.removeEventListener?.('blur',handleBlur);},active(){return !!gesture&&gesture.kind!=='orbit';}};
}
