import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {makeStudio} from '../server/core.js';
import {projectOperations} from '../web/optimistic.js';
import {advanceLearning} from '../web/learning.js';
import {widgetHTML} from '../server/widget.js';

const sampleTool=()=>({id:'practice-device-1',name:'Alat pelatihan bertuas',parts:[
  {id:'body',shape:'box',position:[0,0,0],size:[.25,.15,.15],color:'#aaccbb'},
  {id:'lever',shape:'box',position:[.1,.04,0],size:[.2,.04,.03],color:'#eedd77'}
 ],mechanisms:[{id:'lever-angle',label:'Tuas',kind:'hinge',partIds:['lever'],pivot:[0,0,0],axis:[0,1,0],min:0,max:90,initial:0}],
 learning:{title:'Latihan tuas',steps:[{id:'step-1',instruction:'Putar tuas hingga sudut 40 derajat.',condition:{kind:'mechanism_range',mechanismId:'lever-angle',min:38,max:42}}]}});

test('goniometer bawaan memiliki geometri artikulasi, pembacaan sudut dan panduan mekanis nyata',()=>{
 const world=makeStudio();const a=world.assets.find(a=>a.id==='goniometer');
 assert.ok(a.parts.find(p=>p.id==='moving-arm'));
 assert.deepEqual(a.mechanisms.map(m=>m.id),['arm-angle']);
 assert.equal(a.learning.steps.length,3);
 const id='goniometer-1';
 const e=world.scene.entities.find(e=>e.id===id);
 assert.ok(e);
 let progress=0;
 for(const [angle,index] of [[30,1],[90,2],[0,3]]){
  const operations=[{type:'set_mechanism',entityId:id,mechanismId:'arm-angle',value:angle}];
  const r=world.apply(operations,world.scene.revision);
  assert.ok(r.ok);progress=advanceLearning(a,e,operations,progress);
  assert.equal(progress,index);
 }
 assert.equal(e.controls['arm-angle'],0);
});

test('latihan tidak dapat diselesaikan hanya dengan operasi yang salah urutan',()=>{
 const w=makeStudio(),a=w.assets.find(x=>x.id==='goniometer'),e=w.scene.entities.find(x=>x.id==='goniometer-1');
 const op={type:'set_mechanism',entityId:e.id,mechanismId:'arm-angle',value:90};
 w.apply([op],w.scene.revision);
 assert.equal(advanceLearning(a,e,[op],0),0);
});

test('framework MCP menolak panduan yang merujuk ke mekanisme fiktif',()=>{
 const w=makeStudio();const asset=sampleTool();asset.learning.steps[0].condition.mechanismId='mechanism-not-available';
 assert.throws(()=>w.validateAssetDraft(asset),/mekanisme yang valid/i);
});

test('framework menerima panduan mekanisme valid yang dibuat dari definisi data MCP',()=>{
 const w=makeStudio();const asset=sampleTool();
 assert.equal(w.validateAssetDraft(asset).valid,true);
 const created=w.createAsset(asset);assert.ok(created.ok);
 const snap=w.snapshot();assert.equal(snap.assets.find(a=>a.id===asset.id).learning.steps.length,1);
});

test('optimistic spawn langsung terlihat pada scene lokal tanpa mengganti revisi server',()=>{
 const w=makeStudio().snapshot(),revision=w.scene.revision;
 const op={type:'spawn_asset',id:'rapid-tool',assetId:'stethoscope',position:[0,.8,1]};
 assert.equal(projectOperations(w,[op]),true);
 assert.equal(w.scene.entities.some(e=>e.id==='rapid-tool'),true);
 assert.equal(w.scene.revision,revision);
});

test('optimistic control changes real part state and invalid operation can be discarded atomically by caller',()=>{
 const w=makeStudio().snapshot();
 const e=w.scene.entities.find(e=>e.id==='goniometer-1');
 const result=projectOperations(w,[{type:'set_mechanism',entityId:e.id,mechanismId:'arm-angle',value:30}]);
 assert.equal(result,true);assert.equal(e.controls['arm-angle'],30);
 const copy=structuredClone(w);
 assert.equal(projectOperations(copy,[{type:'set_mechanism',entityId:'missing',mechanismId:'arm-angle',value:42}]),false);
 assert.equal(w.scene.entities.find(e=>e.id==='goniometer-1').controls['arm-angle'],30);
});

test('widget deploy memiliki modul optimistic dan panduan artikulasi tanpa import ESM mentah',()=>{
 const h=widgetHTML(),code=h.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(code&&code.includes('advanceLearning')&&code.includes('projectOperations'));
 assert.doesNotThrow(()=>new vm.Script(code));
 assert.match(h,/practice-micro/);
});
