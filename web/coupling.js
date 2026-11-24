// Deterministic linkage between mechanism values. A declared directed acyclic
// graph prevents feedback loops when AI creates linked levers/dials.
export function applyCouplings(asset,entity,sourceId){
 const defs=new Map((asset.mechanisms||[]).map(m=>[m.id,m]));
 const visit=(id,path=new Set())=>{
  if(path.has(id))throw Error('MECHANISM_CYCLE');
  const source=defs.get(id);if(!source)return;
  const next=new Set([...path,id]);
  for(const d of source.drives||[]){
   const target=defs.get(d.mechanismId);if(!target)continue;
   const raw=(entity.controls[id]??source.initial)*d.ratio+(d.offset??0);
   entity.controls[target.id]=Math.max(target.min,Math.min(target.max,raw));
   visit(target.id,next);
  }
 };
 visit(sourceId);
}
