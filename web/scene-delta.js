// Server and tablet use the same, bounded entity-level delta format.
// Never rebuild a 3D world when one entity moves.
const jsonEqual=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function diffWorld(before,after){
 const old=new Map(before.scene.entities.map(e=>[e.id,e]));
 const now=new Map(after.scene.entities.map(e=>[e.id,e]));
 const upserts=[];const removed=[];
 for(const [id,e] of now)if(!jsonEqual(old.get(id),e))upserts.push(structuredClone(e));
 for(const id of old.keys())if(!now.has(id))removed.push(id);
 const delta={revision:after.scene.revision,upserts,removed};
 if(before.scene.title!==after.scene.title)delta.title=after.scene.title;
 if(!jsonEqual(before.scene.scenario,after.scene.scenario))delta.scenario=structuredClone(after.scene.scenario);
 if(!jsonEqual(before.scene.environment,after.scene.environment))delta.environment=structuredClone(after.scene.environment);
 if(!jsonEqual(before.assets,after.assets))delta.assets=structuredClone(after.assets);
 if(!jsonEqual(before.behaviors,after.behaviors))delta.behaviors=structuredClone(after.behaviors);
 return delta;
}
export function applyWorldDelta(world,delta){
 if(!world?.scene?.entities||!Number.isInteger(delta?.revision))throw Error('Delta scene tidak valid');
 // Already applied messages are harmless. Missing revisions require full reconciliation.
 if(delta.revision<=world.scene.revision)return false;
 if(delta.revision!==world.scene.revision+1)throw Error('DELTA_REVISION_GAP');
 const next=new Map(world.scene.entities.map(e=>[e.id,e]));
 for(const id of delta.removed||[])next.delete(id);
 for(const e of delta.upserts||[]){if(!e?.id)throw Error('Entity delta tidak valid');next.set(e.id,structuredClone(e));}
 world.scene.entities=[...next.values()];
 if(Object.hasOwn(delta,'title'))world.scene.title=delta.title;
 if(delta.scenario)world.scene.scenario=structuredClone(delta.scenario);
 if(delta.environment)world.scene.environment=structuredClone(delta.environment);
 if(delta.assets)world.assets=structuredClone(delta.assets);
 if(delta.behaviors)world.behaviors=structuredClone(delta.behaviors);
 world.scene.revision=delta.revision;
 return true;
}
