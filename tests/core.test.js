import test from 'node:test';
import assert from 'node:assert/strict';
import {Studio,SceneError,POSES} from '../server/core.js';
import {rpc,toolsList} from '../server/mcp.js';

const fresh=()=>new Studio();
test('bootstrap contains two rigged characters, assets and initial scenario',()=>{
 const s=fresh();assert.equal(s.scene.entities.filter(e=>e.type==='character').length,2);
 assert.ok(s.assets.length>=9);assert.ok(s.behaviors.length>=3);assert.equal(s.scene.scenario.id,'shoulder');
});
test('joint manipulation persists as 3D pose values',()=>{
 const s=fresh(),r=s.apply([{type:'set_joint',entityId:'patient',joint:'rightShoulder',axis:'abduction',angle:90}],0);
 assert.equal(r.revision,1);assert.equal(s.scene.entities.find(e=>e.id==='patient').pose.rightShoulder.abduction,90);
});
test('rejects unknown joint, non-finite value and suspicious operations atomically',()=>{
 const s=fresh();assert.throws(()=>s.apply([{type:'move_entity',entityId:'doctor',position:[-4,0,0]},{type:'set_joint',entityId:'patient',joint:'fake',axis:'foo',angle:0}],0),SceneError);
 assert.equal(s.scene.revision,0);assert.deepEqual(s.scene.entities.find(e=>e.id==='doctor').position,[-1.6,0,.45]);
 assert.throws(()=>s.apply([{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:NaN}],0));
});
test('optimistic revision prevents stale ChatGPT writes',()=>{
 const s=fresh();s.apply([{type:'rename_scene',title:'Baru'}],0);
 assert.throws(()=>s.apply([{type:'rename_scene',title:'Tertimpa'}],0),e=>e.code==='REVISION_CONFLICT');
 assert.equal(s.scene.title,'Baru');
});
test('create and test a new AI-defined declarative tool behavior',()=>{
 const s=fresh();
 s.createBehavior({id:'demo-fsm',name:'Demo FSM',states:['off','on'],initial:'off',transitions:[{from:'off',action:'toggle',to:'on',label:'Turn on'},{from:'on',action:'toggle',to:'off',label:'Turn off'}]});
 assert.deepEqual(s.validateBehaviorTest('demo-fsm',['toggle','toggle']).history,['off','on','off']);
 assert.throws(()=>s.validateBehaviorTest('demo-fsm',['unknown']),e=>e.code==='INVALID_TRANSITION');
});
test('AI-defined geometry can be instantiated and state changed',()=>{
 const s=fresh();s.createBehavior({id:'new-behavior',name:'New Behavior',states:['ready','active'],initial:'ready',transitions:[{from:'ready',action:'activate',to:'active',label:'Activate'}]});
 s.createAsset({id:'new-device',name:'New Device',parts:[{shape:'cylinder',position:[0,0,0],size:[.1,.2,.1],color:'#334455'}],anchors:[{id:'grip',position:[0,0,0]}],behaviorId:'new-behavior'});
 const r=s.apply([{type:'spawn_asset',id:'my-device',assetId:'new-device',position:[0,.8,0]},{type:'trigger_action',entityId:'my-device',action:'activate'}],s.scene.revision);
 assert.equal(r.ok,true);assert.equal(s.scene.entities.find(e=>e.id==='my-device').status,'active');
});
test('asset factories reject script injection and unsafe geometries',()=>{
 const s=fresh();assert.throws(()=>s.createAsset({id:'bad',name:'Bad',parts:[{shape:'javascript',position:[0,0,0],size:[1,1,1],color:'#ffffff'}]}));
 assert.throws(()=>s.createAsset({id:'bad',name:'Bad',parts:[{shape:'box',position:[0,0,0],size:[0,0,0],color:'#ffffff'}]}));
 assert.throws(()=>s.createBehavior({id:'loop',name:'Loop',states:['idle'],initial:'idle',transitions:[{from:'idle',action:'eval()',to:'idle',label:'Unsafe'}]}));
});
test('undo redo restore scene, with monotonic revisions',()=>{
 const s=fresh();s.apply([{type:'move_entity',entityId:'doctor',position:[2,0,0]}],0);
 s.historyMove('undo');assert.deepEqual(s.scene.entities.find(e=>e.id==='doctor').position,[-1.6,0,.45]);assert.equal(s.scene.revision,2);
 s.historyMove('redo');assert.deepEqual(s.scene.entities.find(e=>e.id==='doctor').position,[2,0,0]);assert.equal(s.scene.revision,3);
});
test('snapshots export and restore with version checks',()=>{
 const s=fresh();const original=s.snapshot();s.apply([{type:'move_entity',entityId:'patient',position:[1,0,0]}],0);
 s.restore(original,1);assert.equal(s.scene.revision,2);assert.deepEqual(s.scene.entities.find(e=>e.id==='patient').position,[-.2,0,0]);
});
test('scenarios and pose presets apply',()=>{
 const s=fresh();s.apply([{type:'set_scenario',templateId:'blood-pressure'},{type:'apply_pose',entityId:'patient',presetId:'sitting'}],0);
 assert.equal(s.scene.scenario.id,'blood-pressure');assert.equal(s.scene.entities.find(e=>e.id==='patient').pose.rightHip.flexion,-90);
});
test('MCP tools enumerate and can call create state operations',()=>{
 const s=fresh();const initialized=rpc(s,{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-11-25'}});
 assert.equal(initialized.result.serverInfo.name,'osce-sandbox-studio');
 const list=rpc(s,{jsonrpc:'2.0',id:2,method:'tools/list',params:{}});assert.equal(list.result.tools.length,toolsList.length);
 const write=rpc(s,{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'apply_scene_operations',arguments:{baseRevision:0,operations:[{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:45}]}}});
 assert.equal(write.result.isError,false);assert.equal(s.scene.revision,1);
 const invalid=rpc(s,{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'create_asset',arguments:{id:'x',name:'X',parts:[]}}});assert.equal(invalid.result.isError,true);
});

test('all character skeleton joint points stay finite when posed',async()=>{
 const {characterSkeleton}=await import('../web/render3d.js');
 const s=fresh();const patient=s.scene.entities.find(e=>e.id==='patient');
 for(const preset of [undefined,'sitting','raised-arm','right-shoulder-abduction']){
  if(preset)patient.pose=structuredClone(POSES[preset]);
  const joints=characterSkeleton(patient).joints;
  assert.ok(Object.keys(joints).length>=16);
  for(const [name,position] of Object.entries(joints))assert.ok(position.length===3&&position.every(Number.isFinite),`${name} invalid in ${preset||'standing'}`);
 }
});
