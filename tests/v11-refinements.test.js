import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import {makeStudio} from '../server/core.js';
import {projectOperations} from '../web/optimistic.js';
import {applyWorldDelta,diffWorld} from '../web/scene-delta.js';
import {advanceLearning} from '../web/learning.js';
import {anchorPosition,spatialPredicate} from '../web/spatial.js';
import {EnvironmentLibrary} from '../server/environments.js';
import {widgetHTML} from '../server/widget.js';

const tool=()=>({id:'v11-tool',name:'Alat berkomponen',parts:[
 {id:'body',shape:'box',size:[.2,.2,.2],position:[0,0,0],color:'#889988'},
 {id:'lever',shape:'box',size:[.3,.05,.04],position:[.12,0,0],color:'#99aacc'},
 {id:'pointer',shape:'box',size:[.05,.04,.1],position:[0,0,.2],color:'#cc9988'}
],mechanisms:[
 {id:'lever-m',label:'Tuas',kind:'hinge',partIds:['lever'],pivot:[0,0,0],axis:[0,1,0],min:0,max:180,initial:0,drives:[{mechanismId:'pointer-m',ratio:.5,offset:10}]},
 {id:'pointer-m',label:'Pointer',kind:'dial',partIds:['pointer'],pivot:[0,0,0],axis:[0,1,0],min:0,max:100,initial:10}
],anchors:[{id:'moving-tip',partId:'lever',position:[.15,0,0]}],learning:{title:'Kontak target alat',steps:[{id:'touch',instruction:'Dekatkan ujung tuas sampai menyentuh target',condition:{kind:'contact',targetId:'target-1',anchorId:'moving-tip',maxDistance:.12}}]}});

test('optimistic character placement matches server for lying pose and support relation',()=>{
 const server=makeStudio(),local=server.snapshot();
 const op={type:'place_character',entityId:'patient',supportId:'bed-1',affordanceId:'lie'};
 const bed=server.assets.find(a=>a.id==='bed');assert.ok(bed.affordances.find(a=>a.id==='lie'));
 assert.equal(projectOperations(local,[op]),true);
 server.apply([op],0);
 assert.deepEqual(local.scene.entities.find(e=>e.id==='patient'),server.scene.entities.find(e=>e.id==='patient'));
});

test('optimistic surface placement matches server and preserves parent support',()=>{
 const server=makeStudio(),local=server.snapshot();
 const op={type:'place_asset',entityId:'goniometer-1',supportId:'table-1',affordanceId:'top',localOffset:[.12,0,-.06]};
 assert.equal(projectOperations(local,[op]),true);server.apply([op],0);
 assert.deepEqual(local.scene.entities.find(e=>e.id==='goniometer-1'),server.scene.entities.find(e=>e.id==='goniometer-1'));
});

test('delta updates only changed entities and reproduces canonical scene',()=>{
 const s=makeStudio(),client=s.snapshot();
 const r=s.apply([{type:'move_entity',entityId:'bed-1',position:[2,0,1]}],0);
 assert.ok(r.delta.upserts.some(e=>e.id==='bed-1'));
 assert.equal(r.delta.removed.length,0);
 assert.equal(applyWorldDelta(client,r.delta),true);
 assert.deepEqual(client.scene.entities,s.scene.entities);
 assert.equal(applyWorldDelta(client,r.delta),false);
});

test('gap in delta revisions fails closed without partial state mutation',()=>{
 const world=makeStudio().snapshot(),before=structuredClone(world);
 assert.throws(()=>applyWorldDelta(world,{revision:3,removed:['doctor'],upserts:[]}),/DELTA_REVISION_GAP/);
 assert.deepEqual(world,before);
});

test('MCP asset can drive two mechanisms and client projection matches server',()=>{
 const s=makeStudio(),asset=tool();assert.equal(s.validateAssetDraft(asset).valid,true);
 s.createAsset(asset);s.apply([{type:'spawn_asset',id:'instrument-1',assetId:asset.id,position:[0,0,0]}],s.scene.revision);
 const client=s.snapshot(),op={type:'set_mechanism',entityId:'instrument-1',mechanismId:'lever-m',value:80};
 assert.equal(projectOperations(client,[op]),true);
 s.apply([op],s.scene.revision);
 assert.equal(s.scene.entities.find(e=>e.id==='instrument-1').controls['pointer-m'],50);
 assert.deepEqual(client.scene.entities.find(e=>e.id==='instrument-1').controls,s.scene.entities.find(e=>e.id==='instrument-1').controls);
});

test('cyclic coupled mechanism graph rejected before scene creation',()=>{
 const s=makeStudio(),asset=tool();asset.mechanisms[1].drives=[{mechanismId:'lever-m',ratio:1}];
 assert.throws(()=>s.validateAssetDraft(asset),/siklus/i);
});

test('spatial predicate measures moving articulated part anchor',()=>{
 const s=makeStudio();s.createAsset(tool());
 s.apply([{type:'spawn_asset',id:'instrument-1',assetId:'v11-tool',position:[0,0,0]}],s.scene.revision);
 const e=s.scene.entities.find(e=>e.id==='instrument-1');
 const before=anchorPosition(s.snapshot(),e,'moving-tip');
 s.apply([{type:'set_mechanism',entityId:e.id,mechanismId:'lever-m',value:90}],s.scene.revision);
 const after=anchorPosition(s.snapshot(),e,'moving-tip');
 assert.notDeepEqual(after,before);assert.ok(Math.hypot(...after.map((x,i)=>x-before[i]))>.15);
 const target=s.scene.entities.find(e=>e.id==='bed-1');target.id='target-1';target.position=after;
 const w=s.snapshot(),guide=s.assets.find(a=>a.id==='v11-tool');
 const op={type:'move_entity',entityId:'instrument-1',position:[0,0,0]};
 assert.equal(spatialPredicate(guide.learning.steps[0].condition,w,e),true);
 assert.equal(advanceLearning(guide,e,[op],0,w),1);
});

test('spatial teaching rejects unreachable target and invalid future features',()=>{
 const s=makeStudio(),asset=tool();asset.learning.steps[0].condition.targetId='absent';
 assert.equal(s.validateAssetDraft(asset).valid,true);
 assert.equal(spatialPredicate(asset.learning.steps[0].condition,s.snapshot(),{id:'instrument-1',type:'asset',assetId:asset.id,position:[0,0,0],rotation:[0,0,0]}),false);
 asset.learning.steps[0].condition={kind:'pressure_newton',min:2,max:3};
 assert.throws(()=>s.validateAssetDraft(asset),e=>e.code==='UNSUPPORTED_CAPABILITY');
});

test('operationId makes retries safe and rejects different payload reuse',()=>{
 const studio=makeStudio();const one=[{type:'move_entity',entityId:'patient',position:[.7,0,1.2]}];
 const a=studio.apply(one,0,'tablet:gesture-0001');
 const b=studio.apply(one,0,'tablet:gesture-0001');
 assert.equal(b.deduplicated,true);assert.equal(studio.scene.revision,1);
 assert.equal(a.revision,1);
 assert.throws(()=>studio.apply([{type:'move_entity',entityId:'patient',position:[.2,0,.5]}],0,'tablet:gesture-0001'),e=>e.code==='IDEMPOTENCY_CONFLICT');
});

test('MCP autosaved environment keeps retry receipt across service restart',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'osce-v11-idempotent-'));
 try{
  const lib=new EnvironmentLibrary({directory:folder});const meta=lib.create({name:'Retry environment'}),studio=makeStudio();lib.attach(studio,meta.id);
  const ops=[{type:'move_entity',entityId:'bed-1',position:[4,0,2]}];
  const hash='stable-payload-hash-1';
  const result=lib.mutate(studio,(candidate,source)=>candidate.apply(ops,candidate.scene.revision,source==='baseline'?null:'mcp:move-bed-001'),{operationId:'mcp:move-bed-001',payloadHash:hash});
  assert.equal(result.autoSaved,true);
  const reloaded=new EnvironmentLibrary({directory:folder});
  const again=reloaded.mutate(studio,()=>{throw Error('Duplicate must not apply');},{operationId:'mcp:move-bed-001',payloadHash:hash});
  assert.equal(again.deduplicated,true);
  assert.equal(reloaded.get(meta.id).revision,2);
  assert.throws(()=>reloaded.mutate(studio,()=>{}, {operationId:'mcp:move-bed-001',payloadHash:'different'}),e=>e.code==='IDEMPOTENCY_CONFLICT');
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('widget in-chat bundle contains spatial, coupling and scene delta without unresolved module imports',()=>{
 const html=widgetHTML(),body=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(body?.includes('applyWorldDelta')&&body.includes('spatialPredicate')&&body.includes('applyCouplings'));
 assert.doesNotThrow(()=>new vm.Script(body));
});

test('hold checkpoint does not complete until a state remains valid long enough',async()=>{
 const {observeLearning}=await import('../web/learning.js');
 const s=makeStudio(),asset=tool();asset.learning.steps=[{id:'hold',instruction:'Pertahankan tuas pada 30 derajat selama 0.5 detik',condition:{kind:'hold',durationMs:500,predicate:{kind:'mechanism_range',mechanismId:'lever-m',min:27,max:33}}}];
 assert.equal(s.validateAssetDraft(asset).valid,true);s.createAsset(asset);s.apply([{type:'spawn_asset',id:'instrument-1',assetId:asset.id}],s.scene.revision);
 const e=s.scene.entities.find(e=>e.id==='instrument-1'),tracker={since:null};
 e.controls['lever-m']=30;
 assert.equal(observeLearning(asset,e,0,s.snapshot(),tracker,100),0);
 assert.equal(observeLearning(asset,e,0,s.snapshot(),tracker,450),0);
 e.controls['lever-m']=10;
 assert.equal(observeLearning(asset,e,0,s.snapshot(),tracker,490),0);
 e.controls['lever-m']=30;
 assert.equal(observeLearning(asset,e,0,s.snapshot(),tracker,500),0);
 assert.equal(observeLearning(asset,e,0,s.snapshot(),tracker,1001),1);
});

test('invalid hold duration and unsupported nested predicate are rejected',()=>{
 const s=makeStudio(),a=tool();a.learning.steps=[{id:'hold',instruction:'Pertahankan posisi ini selama beberapa detik',condition:{kind:'hold',durationMs:999999,predicate:{kind:'status',value:'on'}}}];
 assert.throws(()=>s.validateAssetDraft(a),/Durasi/);
 a.learning.steps[0].condition={kind:'hold',durationMs:500,predicate:{kind:'invented_force',value:10}};
 assert.throws(()=>s.validateAssetDraft(a),e=>e.code==='UNSUPPORTED_CAPABILITY');
});

test('title changes arrive via incremental delta, without rebuilding scene',()=>{
 const studio=makeStudio(),client=studio.snapshot();
 const r=studio.apply([{type:'rename_scene',title:'Ruang pemeriksaan baru'}],0);
 assert.equal(r.delta.title,'Ruang pemeriksaan baru');
 assert.equal(applyWorldDelta(client,r.delta),true);
 assert.equal(client.scene.title,studio.scene.title);
});

test('MCP create_asset schema advertises complete spatial and mechanical learning capabilities',async()=>{
 const {toolsList}=await import('../server/mcp.js');
 const asset=toolsList.find(t=>t.name==='create_asset');
 assert.ok(asset.inputSchema.properties.learning);
 assert.ok(asset.inputSchema.properties.anchors.items.properties.partId);
 assert.ok(asset.inputSchema.properties.mechanisms.items.properties.drives);
 const patch=toolsList.find(t=>t.name==='apply_scene_operations');
 assert.ok(patch.inputSchema.properties.operationId);
});

test('a mechanism with two driving parents is rejected as ambiguous',()=>{
 const s=makeStudio(),asset=tool();
 asset.mechanisms[0].drives=[];
 asset.mechanisms.push({id:'second-input',label:'Input kedua',kind:'dial',partIds:['body'],pivot:[0,0,0],axis:[0,1,0],min:0,max:90,initial:0,drives:[{mechanismId:'pointer-m',ratio:1}]});
 asset.mechanisms[0].drives=[{mechanismId:'pointer-m',ratio:.5}];
 assert.throws(()=>s.validateAssetDraft(asset),/dua penggerak/);
});
