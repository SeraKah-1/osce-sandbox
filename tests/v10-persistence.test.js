import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EnvironmentLibrary} from '../server/environments.js';
import {makeStudio} from '../server/core.js';

test('MCP authored articulated teaching asset survives process restart, while touch edits do not',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'osce-v10-learning-'));
 try{
  const library=new EnvironmentLibrary({directory:folder});
  const meta=library.create({name:'Instrumen latihan GPT'});
  const studio=makeStudio();library.attach(studio,meta.id);
  const asset={id:'lever-training-ai',name:'Engsel latihan GPT',parts:[
   {id:'housing',shape:'box',position:[0,0,0],size:[.2,.16,.12],color:'#aaccbb'},
   {id:'lever',shape:'box',position:[.15,.04,0],size:[.28,.03,.03],color:'#ddbb77'}
  ],mechanisms:[{id:'hinge',label:'Engsel',kind:'hinge',partIds:['lever'],pivot:[0,0,0],axis:[0,1,0],min:0,max:120,initial:0}],learning:{title:'Gerakkan engsel',steps:[{id:'first',instruction:'Pindahkan engsel ke rentang 30 sampai 40 derajat',condition:{kind:'mechanism_range',mechanismId:'hinge',min:30,max:40}}]}};
  const result=library.mutate(studio,s=>s.createAsset(asset));assert.equal(result.autoSaved,true);
  const freshLibrary=new EnvironmentLibrary({directory:folder});
  assert.equal(freshLibrary.get(meta.id,{withSnapshot:true}).snapshot.assets.find(a=>a.id==='lever-training-ai').learning.steps[0].condition.max,40);
  // Manual operation in the tablet session is not written to environment storage.
  const before=freshLibrary.get(meta.id,{withSnapshot:true}).snapshot.scene.entities.find(e=>e.id==='patient').position;
  studio.apply([{type:'move_entity',entityId:'patient',position:[4,0,3]}],studio.scene.revision);
  const after=freshLibrary.get(meta.id,{withSnapshot:true}).snapshot.scene.entities.find(e=>e.id==='patient').position;
  assert.deepEqual(after,before);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});

test('old saved goniometer blueprint gains real hinge/training on explicit environment load',()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'osce-v10-migration-'));
 try{
  const lib=new EnvironmentLibrary({directory:folder});const env=lib.create({name:'Legacy OSCE'});
  const saved=lib.read(env.id),asset=saved.snapshot.assets.find(a=>a.id==='goniometer');
  // Shape of old builtin: rigid geometry, no mechanism or teaching guide.
  delete asset.mechanisms;delete asset.learning;
  const instance=saved.snapshot.scene.entities.find(e=>e.assetId==='goniometer');delete instance.controls;
  lib.write(saved);
  const studio=makeStudio();const loaded=lib.attach(studio,env.id);
  assert.ok(loaded.environment.revision>env.revision);
  assert.equal(studio.assets.find(a=>a.id==='goniometer').learning.steps.length,3);
  assert.equal(studio.scene.entities.find(e=>e.assetId==='goniometer').controls['arm-angle'],0);
  const again=new EnvironmentLibrary({directory:folder});
  assert.equal(again.get(env.id,{withSnapshot:true}).snapshot.assets.find(a=>a.id==='goniometer').mechanisms.length,1);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
