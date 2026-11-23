import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStudio,SceneError} from '../server/core.js';
import {rpc,toolsList} from '../server/mcp.js';
import {widgetHTML} from '../server/widget.js';

const fresh=()=>makeStudio();
const apply=(studio,operations)=>studio.apply(operations,studio.scene.revision);

test('MCP preview is a true no-write transaction and returns scene diff',()=>{
 const studio=fresh(),before=studio.snapshot();
 const preview=studio.preview([{type:'spawn_asset',id:'lamp-preview',assetId:'flashlight',position:[1,0,1]},{type:'set_joint',entityId:'patient',joint:'rightShoulder',axis:'abduction',angle:62}],0);
 assert.deepEqual(preview.summary.added,['lamp-preview']);
 assert.deepEqual(preview.summary.modified,['patient']);
 assert.equal(preview.scene.entities.find(e=>e.id==='patient').pose.rightShoulder.abduction,62);
 assert.deepEqual(studio.snapshot(),before);
 assert.throws(()=>studio.preview([{type:'rename_scene',title:'Oops'}],999),e=>e.code==='REVISION_CONFLICT');
 assert.throws(()=>studio.preview([{type:'spawn_asset',assetId:'nonexistent'}],0),SceneError);
 assert.deepEqual(studio.snapshot(),before);
 const viaMcp=rpc(studio,{jsonrpc:'2.0',id:1,method:'tools/call',params:{name:'preview_scene_operations',arguments:{baseRevision:0,operations:[{type:'rename_scene',title:'Preview only'}]}}});
 assert.equal(viaMcp.result.isError,false);
 assert.equal(studio.scene.title,before.scene.title);
 assert.ok(toolsList.some(x=>x.name==='preview_scene_operations'));
});

test('stethoscope hold actually attaches to doctor and release detaches',()=>{
 const s=fresh();apply(s,[{type:'spawn_asset',id:'scope',assetId:'stethoscope',position:[0,.7,0]}]);
 apply(s,[{type:'trigger_action',entityId:'scope',action:'hold'}]);
 let e=s.scene.entities.find(e=>e.id==='scope');assert.equal(e.status,'held');assert.equal(e.attachedTo,'doctor');assert.equal(e.anchor,'rightHand');
 apply(s,[{type:'trigger_action',entityId:'scope',action:'release'}]);
 e=s.scene.entities.find(e=>e.id==='scope');assert.equal(e.status,'free');assert.equal(e.attachedTo,undefined);
});

test('rejects nonexistent and circular anchors without mutating the scene',()=>{
 const s=fresh();apply(s,[{type:'spawn_asset',id:'scope',assetId:'stethoscope',position:[0,0,0]}]);
 const snap=s.snapshot();
 assert.throws(()=>apply(s,[{type:'attach',entityId:'scope',targetId:'patient',anchor:'nonexistentJoint'}]),e=>e.code==='NOT_FOUND');
 assert.deepEqual(s.snapshot(),snap);
 apply(s,[{type:'spawn_asset',id:'a',assetId:'stethoscope',position:[0,0,0]},{type:'spawn_asset',id:'b',assetId:'stethoscope',position:[0,0,0]}]);
 apply(s,[{type:'attach',entityId:'a',targetId:'b',anchor:'grip'}]);
 assert.throws(()=>apply(s,[{type:'attach',entityId:'b',targetId:'a',anchor:'grip'}]),e=>e.code==='VALIDATION_ERROR');
});

test('snapshot restore rejects invalid pose, attachments, missing definitions, and loops',()=>{
 const s=fresh();const snapshot=s.snapshot();
 for(const edit of [
  snap=>{snap.scene.entities[0].pose.rightElbow.flexion=NaN;},
  snap=>{snap.scene.entities[0].pose.rightElbow.flexion=999;},
  snap=>{snap.scene.entities.find(e=>e.type==='asset').attachedTo='unknown';},
  snap=>{snap.scene.entities.find(e=>e.type==='asset').attachedTo='patient';snap.scene.entities.find(e=>e.type==='asset').anchor='fake';},
  snap=>{snap.scene.scenario.completed=[999];},
  snap=>{snap.assets[0].behaviorId='missing-behavior';}
 ]){
  const bad=structuredClone(snapshot);edit(bad);
  assert.throws(()=>s.restore(bad,s.scene.revision),SceneError);
  assert.deepEqual(s.snapshot(),snapshot);
 }
});

test('custom behavior update cannot remove currently active state',()=>{
 const s=fresh();s.createBehavior({id:'pulse',name:'Pulse',states:['off','on'],initial:'off',transitions:[{from:'off',action:'turn_on',to:'on',label:'On'}]});
 s.createAsset({id:'pulse-device',name:'Pulse device',parts:[{shape:'box',position:[0,0,0],size:[.2,.2,.2],color:'#abcddd'}],behaviorId:'pulse'});
 apply(s,[{type:'spawn_asset',id:'pulse-1',assetId:'pulse-device',position:[0,0,0]},{type:'trigger_action',entityId:'pulse-1',action:'turn_on'}]);
 const before=s.snapshot();
 assert.throws(()=>s.updateBehavior('pulse',{states:['off'],transitions:[]}),e=>e.code==='INCOMPATIBLE_UPDATE');
 assert.deepEqual(s.snapshot(),before);
});

test('widget bundle is the same minimalist site UI and includes real ChatGPT host bridge',()=>{
 const html=widgetHTML();
 assert.match(html,/OSCE Playground/);
 assert.match(html,/data-panel="add"/);
 assert.match(html,/data-panel="ask"/);
 assert.match(html,/data-panel="practice"/);
 assert.match(html,/ui\/initialize/);
 assert.match(html,/window\.openai\?\.callTool/);
 assert.match(html,/preview_scene_operations/);
 assert.doesNotMatch(html,/JSON BUILDER ALWAYS OPEN/);
});

test('failed undo persistence rolls back in-memory state and retains undo record',()=>{
 const s=fresh();apply(s,[{type:'rename_scene',title:'Modified'}]);
 const before=s.snapshot(),beforeUndo=s.undoStack.length,beforeRedo=s.redoStack.length;
 s.storageFile='/dev/null/unwritable.json';
 assert.throws(()=>s.historyMove('undo'));
 assert.deepEqual(s.snapshot(),before);
 assert.equal(s.undoStack.length,beforeUndo);
 assert.equal(s.redoStack.length,beforeRedo);
 s.storageFile=null;
 assert.equal(s.historyMove('undo').ok,true);
 assert.equal(s.scene.title,'My Studio');
});
