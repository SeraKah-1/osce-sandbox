import {reflowSupported,affordancesFor,characterPlacement,surfacePosition} from './placement.js';
import {applyCouplings} from './coupling.js';
// Optimistic, visual-only application of user actions. The server remains authoritative.
// This module never writes persistent environment blueprints or issues network requests.
const clone=x=>structuredClone(x);
const find=(world,id)=>world.scene.entities.find(e=>e.id===id);
function runAction(world,e,action){
 const a=world.assets.find(v=>v.id===e.assetId),b=world.behaviors.find(v=>v.id===a?.behaviorId);
 const transition=b?.transitions.find(t=>t.from===(e.status??b.initial)&&t.action===action);
 if(!transition)return false;
 for(const guard of transition.when||[]){const value=e.parameters?.[guard.key];if(!(guard.operator==='eq'?value===guard.value:guard.operator==='gte'?value>=guard.value:value<=guard.value))return false;}
 e.status=transition.to;
 for(const effect of transition.effects||[]){
  if(effect.type==='detach'){delete e.attachedTo;delete e.anchor;}
  if(effect.type==='attach'){const target=find(world,effect.targetId);if(target){e.attachedTo=target.id;e.anchor=effect.anchor;delete e.restingOn;}}
  if(effect.type==='move'){e.position=clone(effect.position);delete e.restingOn;}
  if(effect.type==='set_parameter')e.parameters[effect.key]=effect.value;
  if(effect.type==='adjust_parameter'){const val=e.parameters[effect.key]+effect.delta;e.parameters[effect.key]=Math.max(effect.min??-100000,Math.min(effect.max??100000,val));}
 }
 return true;
}
function projectOperations(world,operations){
 if(!world?.scene?.entities)return false;
 for(const op of operations){
  const e=find(world,op.entityId);
  switch(op.type){
   case 'spawn_character':{
    if(find(world,op.id)||!world.poses?.standing)return false;
    world.scene.entities.push({id:op.id,type:'character',role:op.role,name:op.name||'Karakter',position:clone(op.position||[0,0,0]),rotation:[0,0,0],pose:clone(world.poses.standing)});break;
   }
   case 'spawn_asset':{
    const def=world.assets.find(a=>a.id===op.assetId);
    if(!def||find(world,op.id))return false;
    world.scene.entities.push({id:op.id,type:'asset',assetId:def.id,name:def.name,position:clone(op.position||[0,0,0]),rotation:clone(op.rotation||[0,0,0]),status:world.behaviors.find(b=>b.id===def.behaviorId)?.initial||null,parameters:clone(def.parameters||{}),controls:Object.fromEntries((def.mechanisms||[]).map(m=>[m.id,m.initial]))});break;
   }
   case 'delete_entity':{
    if(!e)return false;world.scene.entities=world.scene.entities.filter(x=>x.id!==e.id);
    for(const child of world.scene.entities){if(child.attachedTo===e.id){delete child.attachedTo;delete child.anchor;}if(child.supportedBy?.entityId===e.id)delete child.supportedBy;if(child.restingOn?.entityId===e.id)delete child.restingOn;}
    break;
   }
   case 'move_entity':case 'rotate_entity':{
    if(!e)return false;
    if(op.type==='move_entity'){e.position=clone(op.position);delete e.supportedBy;delete e.restingOn;}
    else e.rotation=clone(op.rotation);
    if(e.type==='asset')reflowSupported(world,e.id);
    break;
   }
   case 'set_joint':{if(!e?.pose?.[op.joint])return false;e.pose[op.joint][op.axis]=op.angle;break;}
   case 'apply_pose':{if(!e||!world.poses?.[op.presetId])return false;e.pose=clone(world.poses[op.presetId]);delete e.supportedBy;break;}
   case 'set_mechanism':{
    const a=world.assets.find(a=>a.id===e?.assetId),m=a?.mechanisms?.find(m=>m.id===op.mechanismId);
    if(!m)return false;
    e.controls=e.controls||{};const previous=e.controls[m.id]??m.initial;e.controls[m.id]=op.value;applyCouplings(a,e,m.id);
    const edge=Math.abs(op.value-m.max)<1e-6&&Math.abs(previous-m.max)>1e-6?'max':Math.abs(op.value-m.min)<1e-6&&Math.abs(previous-m.min)>1e-6?'min':null;
    if(edge&&m.triggers?.[edge])runAction(world,e,m.triggers[edge]);
    break;
   }
   case 'trigger_action':{if(!e||!runAction(world,e,op.action))return false;break;}
   case 'attach':{if(!e||!find(world,op.targetId))return false;e.attachedTo=op.targetId;e.anchor=op.anchor||'rightHand';delete e.restingOn;break;}
   case 'detach':{if(!e)return false;delete e.attachedTo;delete e.anchor;break;}
   case 'complete_step':case 'uncomplete_step':{
    const s=world.scene.scenario;s.completed=s.completed||[];if(op.type==='complete_step'){if(!s.completed.includes(op.index))s.completed.push(op.index);}else s.completed=s.completed.filter(i=>i!==op.index);break;
   }
   case 'set_scenario':{const template=world.templates.find(t=>t.id===op.templateId);if(!template)return false;world.scene.scenario={...clone(template),completed:[]};break;}
   case 'place_character':{
    const support=find(world,op.supportId);
    if(e?.type!=='character'||support?.type!=='asset')return false;
    const a=affordancesFor(world,support).find(a=>a.id===op.affordanceId&&['seat','bed'].includes(a.kind));
    const placement=a&&characterPlacement(world,e,support,a);
    if(!placement)return false;
    e.position=clone(placement.position);e.rotation=clone(placement.rotation);e.pose=clone(world.poses[placement.pose]);
    e.supportedBy={entityId:support.id,affordanceId:a.id,kind:a.kind};break;
   }
   case 'place_asset':{
    const support=find(world,op.supportId);
    if(e?.type!=='asset'||support?.type!=='asset'||e.attachedTo||!Array.isArray(op.localOffset)||op.localOffset.length!==3)return false;
    const a=affordancesFor(world,support).find(a=>a.id===op.affordanceId&&a.kind==='surface');
    if(!a||op.localOffset.some(v=>!Number.isFinite(v))||Math.abs(op.localOffset[0])>a.halfExtents[0]+.05||Math.abs(op.localOffset[2])>a.halfExtents[1]+.05||Math.abs(op.localOffset[1])>.2)return false;
    const p=surfacePosition(world,e,support,a,op.localOffset);if(!p)return false;
    e.position=clone(p);e.restingOn={entityId:support.id,affordanceId:a.id,localOffset:clone(op.localOffset)};break;
   }
   default:return false;
  }
 }
 return true;
}

export {projectOperations};
