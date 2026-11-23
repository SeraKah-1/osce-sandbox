import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {EnvironmentLibrary} from '../server/environments.js';
import {makeStudio} from '../server/core.js';
import {SessionWorlds} from '../server/sessions.js';
import {rpc} from '../server/mcp.js';

function sandbox(fn){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'osce-v09-'));try{return fn(dir)}finally{fs.rmSync(dir,{recursive:true,force:true})}}
const command=(studio,ops)=>studio.apply(ops,studio.scene.revision);
test('MCP-created environment survives new library instance, no manual change persists',()=>sandbox(dir=>{
 const lib=new EnvironmentLibrary({directory:dir});const {id}=lib.create({name:'Scene OSCE kepala',operations:[{type:'rename_scene',title:'Head Exam'}]});
 assert.match(id,/^env-[a-f0-9]{32}$/);
 const live=makeStudio(null);live.sessionId='tablet';lib.attach(live,id);
 command(live,[{type:'move_entity',entityId:'patient',position:[8,0,0]}]);
 assert.deepEqual(live.scene.entities.find(e=>e.id==='patient').position,[8,0,0]);
 assert.deepEqual(lib.get(id,{withSnapshot:true}).snapshot.scene.entities.find(e=>e.id==='patient').position,[-.2,0,0]);
 lib.mutate(live,(studio,role)=>command(studio,[{type:'rename_scene',title:'Saved through MCP'}]));
 assert.equal(live.scene.title,'Saved through MCP');
 const recovered=new EnvironmentLibrary({directory:dir}).get(id,{withSnapshot:true});
 assert.equal(recovered.snapshot.scene.title,'Saved through MCP');
 assert.deepEqual(recovered.snapshot.scene.entities.find(e=>e.id==='patient').position,[-.2,0,0]);
}));

test('MCP changes to assets, behavior and scene are persisted independently from gestures',()=>sandbox(dir=>{
 const lib=new EnvironmentLibrary({directory:dir});const {id}=lib.create({name:'Rig test'});const live=makeStudio(null);live.sessionId='tablet';lib.attach(live,id);
 lib.mutate(live,s=>s.createBehavior({id:'switch-test',name:'Switch',states:['off','on'],initial:'off',transitions:[{from:'off',action:'toggle',to:'on',label:'On'}]}));
 lib.mutate(live,s=>s.createAsset({id:'asset-test',name:'Device',parts:[{shape:'box',position:[0,0,0],size:[.2,.2,.2],color:'#ffeecc'}],behaviorId:'switch-test'}));
 lib.mutate(live,(s)=>command(s,[{type:'spawn_asset',id:'device-1',assetId:'asset-test',position:[1,0,1]}]));
 const saved=lib.get(id,{withSnapshot:true});assert.equal(saved.snapshot.assets.find(a=>a.id==='asset-test').name,'Device');
 assert.equal(saved.snapshot.scene.entities.find(e=>e.id==='device-1').position[0],1);
}));

test('library deletion is explicit, removes entry and does not delete active scene',()=>sandbox(dir=>{
 const lib=new EnvironmentLibrary({directory:dir});const {id}=lib.create({name:'Disposable'});const live=makeStudio(null);lib.attach(live,id);
 assert.throws(()=>lib.delete(id,{}),e=>e.code==='CONFIRMATION_REQUIRED');
 assert.equal(lib.list().length,1);
 assert.equal(lib.delete(id,{confirmed:true}).deleted,true);
 assert.equal(lib.list().length,0);
 assert.throws(()=>lib.get(id),e=>e.code==='NOT_FOUND');
 assert.ok(live.scene.entities.length);
}));

test('unsafe IDs, too many environments and corrupt JSON rejected',()=>sandbox(dir=>{
 const lib=new EnvironmentLibrary({directory:dir,limit:1});
 assert.throws(()=>lib.get('../../etc/passwd'),e=>e.code==='INVALID_ID');
 assert.throws(()=>lib.create({name:'  '}));
 const {id}=lib.create({name:'Valid'});
 assert.throws(()=>lib.create({name:'Second'}),e=>e.code==='ENVIRONMENT_LIMIT');
 fs.writeFileSync(path.join(dir,id+'.json'),'invalid json');
 assert.throws(()=>lib.get(id),e=>e.code==='STORAGE_CORRUPT');
}));

test('storage failure during MCP change rolls back world without sending success event',()=>sandbox(dir=>{
 const lib=new EnvironmentLibrary({directory:dir}),{id}=lib.create({name:'Safe'}),live=makeStudio(null);lib.attach(live,id);
 const before=live.snapshot(),events=[];live.listeners.add(e=>events.push(e));
 const original=lib.write.bind(lib);lib.write=()=>{throw Error('disk full')};
 assert.throws(()=>lib.mutate(live,s=>command(s,[{type:'rename_scene',title:'Unsaved'}])),/disk full/);
 lib.write=original;
 assert.deepEqual(live.snapshot(),before);assert.equal(events.length,0);
 assert.equal(lib.get(id).name,'Safe');
}));

test('MCP library tools manage environments, and no global session fallback exists',()=>sandbox(dir=>{
 const library=new EnvironmentLibrary({directory:dir}),worlds=new SessionWorlds();
 const resolver=(id,create)=>{if(create&&!id)return worlds.get(worlds.create().sessionId);return worlds.get(id)};
 const send=(name,args={})=>rpc(resolver,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},{library,worlds}).result;
 const missing=send('get_world_state',{});assert.equal(missing.isError,true);
 const created=send('create_environment',{name:'By GPT'});assert.equal(created.isError,false);
 const env=created.structuredContent.environment;
 const loaded=send('load_environment',{environmentId:env.id});assert.equal(loaded.isError,false);
 const sid=loaded.structuredContent.sessionId;
 const before=send('get_world_state',{sessionId:sid}).structuredContent.scene.revision;
 const edited=send('apply_scene_operations',{sessionId:sid,baseRevision:before,operations:[{type:'rename_scene',title:'AI saved'}]});
 assert.equal(edited.isError,false);assert.equal(edited.structuredContent.autoSaved,true);
 assert.equal(send('get_environment',{environmentId:env.id}).structuredContent.snapshot.scene.title,'AI saved');
 assert.equal(send('list_environments').structuredContent.environments.length,1);
 assert.equal(send('delete_environment',{environmentId:env.id,confirmed:false}).isError,true);
 assert.equal(send('delete_environment',{environmentId:env.id,confirmed:true}).structuredContent.deleted,true);
 assert.equal(worlds.get(sid).environmentId,null);
 assert.equal(worlds.get(sid).scene.title,'AI saved');
}));

test('durable undo and redo of GPT environment edits across library restarts',()=>sandbox(dir=>{
 let library=new EnvironmentLibrary({directory:dir});const {id}=library.create({name:'History'});
 const studio=makeStudio(null);library.attach(studio,id);
 library.mutate(studio,s=>command(s,[{type:'rename_scene',title:'Alpha'}]));
 library.mutate(studio,s=>command(s,[{type:'rename_scene',title:'Beta'}]));
 library=new EnvironmentLibrary({directory:dir});
 assert.equal(library.history(id,'undo').revision,4);
 assert.equal(library.get(id,{withSnapshot:true}).snapshot.scene.title,'Alpha');
 assert.equal(library.history(id,'redo').revision,5);
 assert.equal(library.get(id,{withSnapshot:true}).snapshot.scene.title,'Beta');
}));

test('stale tablet environment session cannot silently overwrite another GPT edit',()=>sandbox(dir=>{
 const library=new EnvironmentLibrary({directory:dir}),{id}=library.create({name:'Shared'});
 const a=makeStudio(null),b=makeStudio(null);library.attach(a,id);library.attach(b,id);
 library.mutate(a,s=>command(s,[{type:'rename_scene',title:'First edit'}]));
 assert.throws(()=>library.mutate(b,s=>command(s,[{type:'rename_scene',title:'Stale overwrite'}])),e=>e.code==='ENVIRONMENT_REVISION_CONFLICT');
 assert.equal(library.get(id,{withSnapshot:true}).snapshot.scene.title,'First edit');
 assert.equal(b.scene.title,'My Studio');
 library.attach(b,id);
 library.mutate(b,s=>command(s,[{type:'rename_scene',title:'After reload'}]));
 assert.equal(library.get(id,{withSnapshot:true}).snapshot.scene.title,'After reload');
}));

test('invalid initial environment operations do not produce saved files',()=>sandbox(dir=>{
 const library=new EnvironmentLibrary({directory:dir});
 assert.throws(()=>library.create({name:'Broken',operations:[{type:'spawn_asset',assetId:'does-not-exist'}]}));
 assert.equal(library.list().length,0);
}));

test('MCP reload/undo/redo a saved world while keeping active live session bound',()=>sandbox(dir=>{
 const library=new EnvironmentLibrary({directory:dir}),worlds=new SessionWorlds();
 const resolve=(id,create)=>create&&!id?worlds.get(worlds.create().sessionId):worlds.get(id);
 const send=(name,args={})=>rpc(resolve,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}},{library,worlds}).result;
 const env=send('create_environment',{name:'Undo world'}).structuredContent.environment;
 const loaded=send('load_environment',{environmentId:env.id}).structuredContent;
 const sid=loaded.sessionId;
 const first=send('apply_scene_operations',{sessionId:sid,baseRevision:loaded.scene.revision,operations:[{type:'rename_scene',title:'Scene after edit'}]});
 assert.equal(first.isError,false);
 const reverted=send('undo_environment',{environmentId:env.id,sessionId:sid});
 assert.equal(reverted.isError,false);assert.equal(reverted.structuredContent.scene.title,'My Studio');
 const redone=send('redo_environment',{environmentId:env.id,sessionId:sid});
 assert.equal(redone.isError,false);assert.equal(redone.structuredContent.scene.title,'Scene after edit');
}));
