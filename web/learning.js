import {spatialPredicate,isSpatialCondition,anchorPosition} from './spatial.js';
// Progress comes from an actual instrument operation and the resulting scene.
// For spatial checkpoints, both the instrument and the target must exist.
const near=(a,b)=>Number.isFinite(a)&&a>=b[0]&&a<=b[1];
function checkpointReached(step,entity,operation,world){
 const c=step?.condition;if(!c||!entity||!operation||operation.entityId!==entity.id)return false;
 if(c.kind==='mechanism_range')return operation.type==='set_mechanism'&&operation.mechanismId===c.mechanismId&&near(entity.controls?.[c.mechanismId],[c.min,c.max]);
 if(c.kind==='action')return operation.type==='trigger_action'&&operation.action===c.action;
 if(c.kind==='status')return ['trigger_action','set_mechanism'].includes(operation.type)&&entity.status===c.value;
 if(c.kind==='parameter_range')return ['trigger_action','set_mechanism'].includes(operation.type)&&near(entity.parameters?.[c.key],[c.min,c.max]);
 if(c.kind==='attached')return operation.type==='attach'&&entity.attachedTo===c.targetId;
 if(c.kind==='detached')return operation.type==='detach'&&!entity.attachedTo;
 if(isSpatialCondition(c))return ['move_entity','rotate_entity','place_asset','place_character','attach','set_mechanism'].includes(operation.type)&&spatialPredicate(c,world,entity);
 return false;
}
function advanceLearning(asset,entity,operations,index=0,world=null){
 const steps=asset?.learning?.steps||[];if(!steps.length||index>=steps.length)return index;
 for(const op of operations){if(checkpointReached(steps[index],entity,op,world))return index+1;}
 return index;
}
export {advanceLearning,checkpointReached};

// Duration conditions check an actual maintained mechanism/position in the
// running scene. They reset when the tool leaves the target range.
export function observeLearning(asset,entity,index,world,tracker,nowMs){
 const step=asset?.learning?.steps?.[index];
 if(!step||step.condition?.kind!=='hold')return index;
 const c=step.condition.predicate;
 let match=false;
 if(c.kind==='mechanism_range')match=near(entity.controls?.[c.mechanismId],[c.min,c.max]);
 else if(c.kind==='parameter_range')match=near(entity.parameters?.[c.key],[c.min,c.max]);
 else if(c.kind==='status')match=entity.status===c.value;
 else if(isSpatialCondition(c))match=spatialPredicate(c,world,entity);
 if(!match){tracker.since=null;return index;}
 if(!Number.isFinite(tracker.since))tracker.since=nowMs;
 if(nowMs-tracker.since>=step.condition.durationMs){tracker.since=null;return index+1;}
 return index;
}

export function learningFeedback(step,entity,world,tracker=null,nowMs=0){
 if(!step||!entity)return '';
 const c=step.condition?.kind==='hold'?step.condition.predicate:step.condition;
 if(!c)return '';
 const hold=step.condition?.kind==='hold';
 let message='';
 if(c.kind==='distance'||c.kind==='contact'){
  const other=world?.scene?.entities?.find(e=>e.id===c.targetId);
  const a=anchorPosition(world,entity,c.anchorId),b=anchorPosition(world,other,c.targetAnchor);
  if(!a||!b)return 'Target atau titik kontak belum tersedia dalam scene';
  const d=Math.hypot(...a.map((v,i)=>v-b[i]));
  message=`Jarak ${d.toFixed(2)} m · target maksimal ${(c.maxDistance??.08).toFixed(2)} m`;
 }else if(c.kind==='orientation'){
  const other=world?.scene?.entities?.find(e=>e.id===c.targetId);
  if(!other)return 'Target orientasi tidak ditemukan';
  const ax=c.axisIndex??1,angle=Math.abs(Math.atan2(Math.sin((entity.rotation?.[ax]||0)-(other.rotation?.[ax]||0)),Math.cos((entity.rotation?.[ax]||0)-(other.rotation?.[ax]||0))));
  message=`Selisih orientasi ${(angle*180/Math.PI).toFixed(0)}° · toleransi ${(c.maxAngle*180/Math.PI).toFixed(0)}°`;
 }else if(c.kind==='mechanism_range')message=`Sudut ${(entity.controls?.[c.mechanismId]||0).toFixed(1)} · target ${c.min}–${c.max}`;
 else if(c.kind==='status')message=`Status ${entity.status||'belum aktif'} · target ${c.value}`;
 if(hold){const elapsed=Number.isFinite(tracker?.since)?Math.max(0,nowMs-tracker.since):0;message+=` · tahan ${(elapsed/1000).toFixed(1)} / ${(step.condition.durationMs/1000).toFixed(1)} detik`;}
 return message;
}
