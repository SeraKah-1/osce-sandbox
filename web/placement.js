// Non-physical, optional magnetic surface placement for tabletop instruments.
// Only explicit support surfaces are eligible; character anatomy is not simulated.
const distanceXZ=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
const surfaceKinds=new Set(['table','bed']);
export function placementCandidate(world,entity,position){
 if(!world||entity?.type!=='asset'||entity.attachedTo)return null;
 const blueprint=world.assets.find(a=>a.id===entity.assetId);
 if(!blueprint||blueprint.category==='Furnitur')return null;
 let best=null;
 for(const support of world.scene.entities.filter(e=>e.type==='asset'&&surfaceKinds.has(e.assetId))){
  const def=world.assets.find(a=>a.id===support.assetId);
  const anchor=def?.anchors?.find(a=>['top','surface'].includes(a.id));
  const top=def?.parts?.filter(p=>p.shape==='box').reduce((max,p)=>Math.max(max,p.position[1]+p.size[1]/2),-Infinity);
  if(!anchor||!Number.isFinite(top))continue;
  const base=support.position||[0,0,0],dy=position[1]-(base[1]+anchor.position[1]);
  const yaw=support.rotation?.[1]||0;const dx=position[0]-base[0],dz=position[2]-base[2];
  const lx=Math.cos(yaw)*dx-Math.sin(yaw)*dz,lz=Math.sin(yaw)*dx+Math.cos(yaw)*dz;
  const deck=def.parts.find(p=>p.shape==='box'&&Math.abs(p.position[1]+p.size[1]/2-top)<.04);
  if(!deck||Math.abs(lx-deck.position[0])>deck.size[0]*.5+.06||Math.abs(lz-deck.position[2])>deck.size[2]*.5+.06)continue;
  // Do not yank an existing instrument from another elevated support.
  if(Math.abs(dy)>1.6)continue;
  const bottom=Math.min(...blueprint.parts.map(p=>p.position[1]-p.size[1]/2));
  const pos=[position[0],base[1]+top-bottom+.012,position[2]];
  const cost=distanceXZ(position,base)+Math.abs(dy)*.1;
  if(!best||cost<best.cost)best={supportId:support.id,supportName:support.name,position:pos,cost};
 }
 return best;
}
export function chairCandidate(world,position){
 if(!world?.scene)return null;
 let best=null;
 for(const chair of world.scene.entities.filter(e=>e.type==='asset'&&e.assetId==='chair')){
  const d=distanceXZ(position,chair.position);
  if(d>.34||best&&d>=best.distance)continue;
  const anchor=world.assets.find(a=>a.id==='chair')?.anchors.find(a=>a.id==='seat');
  const y=chair.position[1]+(anchor?.position[1]??.52)-.95;
  best={supportId:chair.id,supportName:chair.name,position:[chair.position[0],y,chair.position[2]],distance:d};
 }
 return best;
}
