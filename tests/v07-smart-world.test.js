import test from 'node:test';
import assert from 'node:assert/strict';
import {Studio} from '../server/core.js';
import {characterSkeleton} from '../web/render3d.js';
import {characterPlacementCandidate,surfaceCandidate,reflowSupported} from '../web/placement.js';
import {hitTestPuppet,installDirectTouch} from '../web/touch-pose.js';
import {widgetHTML} from '../server/widget.js';
import {rpc} from '../server/mcp.js';

const person=w=>w.scene.entities.find(e=>e.id==='patient');
const get=(w,id)=>w.scene.entities.find(e=>e.id===id);
const near=(a,b,epsilon=1e-4)=>Math.abs(a-b)<epsilon;
const applied=(w,ops)=>w.apply(ops,w.scene.revision);

test('bed affordance lies patient down in real 3D, rotated onto the mattress',()=>{
 const w=new Studio();const candidate=characterPlacementCandidate(w.snapshot(),person(w),[1.9,0,-1.75]);
 assert.equal(candidate.kind,'bed');assert.equal(candidate.supportId,'bed-1');
 applied(w,[{type:'place_character',entityId:'patient',supportId:'bed-1',affordanceId:'lie'}]);
 const e=person(w),sk=characterSkeleton(e).joints;
 assert.equal(e.supportedBy.kind,'bed');assert.ok(near(e.rotation[0],Math.PI/2));
 assert.ok(Math.abs(sk.head[1]-sk.hip[1])<.07,'head and hip both near bed height');
 assert.ok(Math.abs(sk.head[2]-sk.hip[2])>.5,'the character actually lies horizontally');
 assert.ok(near(sk.hip[1],.81,.015),'hips are aligned with the bed surface');
});

test('chair affordance seats patient and follows a moved or rotated chair; undo restores both',()=>{
 const w=new Studio();applied(w,[{type:'spawn_asset',assetId:'chair',id:'chair-a',position:[0,0,0]}]);
 const candidate=characterPlacementCandidate(w.snapshot(),person(w),[.1,0,.1]);
 assert.equal(candidate.kind,'seat');
 applied(w,[{type:'place_character',entityId:'patient',supportId:'chair-a',affordanceId:'sit'}]);
 const before=structuredClone(person(w));assert.equal(before.pose.rightKnee.flexion,90);
 applied(w,[{type:'move_entity',entityId:'chair-a',position:[2,0,1]}]);
 assert.ok(near(person(w).position[0],2)&&near(person(w).position[2],1));
 applied(w,[{type:'rotate_entity',entityId:'chair-a',rotation:[0,1.25,0]}]);
 assert.ok(near(person(w).rotation[1],1.25));
 w.historyMove('undo');assert.ok(near(person(w).rotation[1],0));
 w.historyMove('undo');assert.deepEqual(person(w),before);
});

test('moving the bed carries a lying patient; moving the table carries the goniometer',()=>{
 const w=new Studio();applied(w,[{type:'place_character',entityId:'patient',supportId:'bed-1',affordanceId:'lie'}]);
 const hip0=characterSkeleton(person(w)).joints.hip;
 applied(w,[{type:'move_entity',entityId:'bed-1',position:[3,0,-2.2]}]);
 const hip1=characterSkeleton(person(w)).joints.hip;
 assert.ok(near(hip1[0]-hip0[0],1.1));assert.ok(near(hip1[2]-hip0[2],-.45));
 const item0=[...get(w,'goniometer-1').position];
 applied(w,[{type:'move_entity',entityId:'table-1',position:[-1,0,-1]}]);
 const item1=get(w,'goniometer-1').position;
 assert.ok(near(item1[0]-item0[0],1.2));assert.ok(near(item1[2]-item0[2],.55));
});

test('custom AI-created support works without hard-coded object ID',()=>{
 const w=new Studio();
 const definition={id:'custom-lounger',name:'Reclining lounger',category:'Buatan AI',movable:true,
   parts:[{shape:'box',position:[0,.54,0],size:[2.2,.16,.85],color:'#a5cdbd'}],
   anchors:[{id:'platform',position:[0,.65,0]}],
   affordances:[{id:'rest',kind:'bed',anchor:'platform',pose:'lying',radius:1.3,yawOffset:Math.PI/2},
                {id:'place',kind:'surface',anchor:'platform',halfExtents:[1,.35]}]};
 w.createAsset(definition);applied(w,[{type:'spawn_asset',id:'lounger-1',assetId:'custom-lounger',position:[0,0,1]}]);
 const candidate=characterPlacementCandidate(w.snapshot(),person(w),[0,0,1]);
 assert.equal(candidate.supportId,'lounger-1');
 applied(w,[{type:'place_character',entityId:'patient',supportId:'lounger-1',affordanceId:'rest'}]);
 assert.equal(person(w).supportedBy.entityId,'lounger-1');
 applied(w,[{type:'move_entity',entityId:'lounger-1',position:[1,0,1]}]);
 assert.ok(near(person(w).position[0],1));
});

test('new surface affordance from AI can support equipment, with validated offsets',()=>{
 const w=new Studio();w.createAsset({id:'floating-shelf',name:'Custom shelf',category:'Furnitur',
   parts:[{shape:'box',position:[0,.6,0],size:[.9,.1,.5],color:'#8fabcd'}],anchors:[{id:'top',position:[0,.65,0]}],
   affordances:[{id:'surface-a',kind:'surface',anchor:'top',halfExtents:[.42,.22]}]});
 applied(w,[{type:'spawn_asset',id:'shelf-a',assetId:'floating-shelf',position:[0,0,0]},{type:'spawn_asset',id:'probe-a',assetId:'flashlight',position:[.1,0,.1]}]);
 const candidate=surfaceCandidate(w.snapshot(),get(w,'probe-a'),[.1,.5,.1]);
 assert.equal(candidate.supportId,'shelf-a');
 applied(w,[{type:'place_asset',entityId:'probe-a',supportId:'shelf-a',affordanceId:'surface-a',localOffset:[.1,0,.1]}]);
 assert.equal(get(w,'probe-a').restingOn.entityId,'shelf-a');
 assert.throws(()=>applied(w,[{type:'place_asset',entityId:'probe-a',supportId:'shelf-a',affordanceId:'surface-a',localOffset:[20,0,0]}]),/luar permukaan/);
});

test('moving an occupant off support clears relation; removing support does not leave dangling links',()=>{
 const w=new Studio();applied(w,[{type:'spawn_asset',id:'chair-d',assetId:'chair',position:[0,0,0]}]);
 applied(w,[{type:'place_character',entityId:'patient',supportId:'chair-d',affordanceId:'sit'}]);
 applied(w,[{type:'move_entity',entityId:'patient',position:[3,0,1]}]);
 assert.equal(person(w).supportedBy,undefined);
 applied(w,[{type:'place_character',entityId:'patient',supportId:'chair-d',affordanceId:'sit'}]);
 applied(w,[{type:'delete_entity',entityId:'chair-d'}]);
 assert.equal(person(w).supportedBy,undefined);
});

test('invalid AI affordances fail safely and cannot remove a used affordance',()=>{
 const w=new Studio();const draft={id:'seat-pod',name:'Seat pod',parts:[{shape:'box',size:[1,1,1],position:[0,0,0],color:'#123abc'}],
  anchors:[{id:'seat',position:[0,1,0]}],affordances:[{id:'sit',kind:'seat',anchor:'missing',radius:.8}]};
 assert.throws(()=>w.createAsset(draft),/anchor/);
 draft.affordances[0].anchor='seat';w.createAsset(draft);
 applied(w,[{type:'spawn_asset',id:'seat-instance',assetId:'seat-pod',position:[0,0,0]}]);
 applied(w,[{type:'place_character',entityId:'patient',supportId:'seat-instance',affordanceId:'sit'}]);
 assert.throws(()=>w.updateAsset('seat-pod',{affordances:[]}),/masih digunakan/);
 assert.equal(w.assets.find(a=>a.id==='seat-pod').affordances.length,1);
});

test('declarative state effects update parameters and guards reject impossible actions',()=>{
 const w=new Studio();w.createBehavior({id:'lamp-program',name:'Lamp state machine',states:['on'],initial:'on',
  transitions:[{from:'on',to:'on',action:'dim',label:'Reduce',when:[{key:'brightness',operator:'gte',value:1}],effects:[{type:'adjust_parameter',key:'brightness',delta:-1,min:0,max:5}]},
               {from:'on',to:'on',action:'reset',label:'Reset',effects:[{type:'set_parameter',key:'brightness',value:3}]}]});
 w.createAsset({id:'lamp-custom',name:'Lamp custom',parts:[{shape:'sphere',position:[0,0,0],size:[.2,.2,.2],color:'#ffdcaa'}],anchors:[],parameters:{brightness:1},behaviorId:'lamp-program'});
 applied(w,[{type:'spawn_asset',id:'lamp-a',assetId:'lamp-custom',position:[0,0,0]}]);
 applied(w,[{type:'trigger_action',entityId:'lamp-a',action:'dim'}]);
 assert.equal(get(w,'lamp-a').parameters.brightness,0);
 const before=w.scene.revision;
 assert.throws(()=>applied(w,[{type:'trigger_action',entityId:'lamp-a',action:'dim'}]),/Syarat/);
 assert.equal(w.scene.revision,before);
 applied(w,[{type:'trigger_action',entityId:'lamp-a',action:'reset'}]);
 assert.equal(get(w,'lamp-a').parameters.brightness,3);
});

test('scene snapshots containing support relations and parameters restore and validate',()=>{
 const w=new Studio();applied(w,[{type:'place_character',entityId:'patient',supportId:'bed-1',affordanceId:'lie'}]);
 const snapshot=w.snapshot();
 applied(w,[{type:'move_entity',entityId:'patient',position:[0,0,0]}]);
 w.restore(snapshot,w.scene.revision);
 assert.equal(person(w).supportedBy.kind,'bed');
 const corrupt=structuredClone(snapshot);corrupt.scene.entities.find(e=>e.id==='patient').supportedBy.affordanceId='unknown';
 assert.throws(()=>w.restore(corrupt,w.scene.revision),/permukaan karakter/);
});

test('furniture silhouette is touch selectable even when tapping far from its origin',()=>{
 const w=new Studio();const e=get(w,'bed-1');
 const project=p=>({x:370+p[0]*90+p[2]*20,y:280-p[1]*75+p[2]*48,z:.1,visible:true});
 const bedCorner=[e.position[0]+.5,e.position[1]+.62,e.position[2]+.25];
 const hit=hitTestPuppet(w.snapshot(),project,characterSkeleton,x=>x.position,project(bedCorner));
 assert.equal(hit?.entityId,'bed-1');assert.equal(hit?.kind,'move-asset');
});

test('MCP tool schema exposes affordances and placement operations; widget includes new placement logic',()=>{
 const w=new Studio();const list=rpc(w,{jsonrpc:'2.0',method:'tools/list',id:1}).result.tools;
 const asset=list.find(t=>t.name==='create_asset');
 assert.ok(asset.inputSchema.properties.affordances);assert.ok(asset.inputSchema.properties.parameters);
 assert.ok(list.find(t=>t.name==='apply_scene_operations').description.includes('place_character'));
 const html=widgetHTML();assert.match(html,/characterPlacementCandidate/);assert.match(html,/reflowSupported/);
});

test('AI behavior cannot be attached to asset without required parameter',()=>{
 const w=new Studio();w.createBehavior({id:'pump-rule',name:'Pump Rule',states:['off','on'],initial:'off',transitions:[
  {from:'off',to:'on',action:'pump',label:'Pompa',effects:[{type:'adjust_parameter',key:'pressure',delta:15,min:0,max:200}]},
  {from:'on',to:'off',action:'release',label:'Lepaskan'}]});
 const draft={id:'pump-draft',name:'Custom Pump',parts:[{shape:'box',position:[0,0,0],size:[.2,.2,.2],color:'#6688aa'}],behaviorId:'pump-rule'};
 assert.throws(()=>w.createAsset(draft),/pressure/);
 w.createAsset({...draft,parameters:{pressure:0}});
 assert.equal(w.assets.find(a=>a.id==='pump-draft').parameters.pressure,0);
});

test('cannot delete active parameter or introduce incompatible transition in behavior update',()=>{
 const w=new Studio();w.createBehavior({id:'condition-b',name:'Condition',states:['idle'],initial:'idle',transitions:[
  {from:'idle',to:'idle',action:'toggle',label:'Toggle',effects:[{type:'set_parameter',key:'enabled',value:true}]}]});
 w.createAsset({id:'condition-tool',name:'Condition Tool',parts:[{shape:'box',position:[0,0,0],size:[.2,.2,.2],color:'#112233'}],parameters:{enabled:false},behaviorId:'condition-b'});
 applied(w,[{type:'spawn_asset',id:'condition-one',assetId:'condition-tool',position:[0,0,0]}]);
 assert.throws(()=>w.updateAsset('condition-tool',{parameters:{}}),/enabled/);
 assert.throws(()=>w.updateBehavior('condition-b',{transitions:[{from:'idle',to:'idle',action:'toggle',label:'Toggle',when:[{key:'temperature',operator:'gte',value:20}]}]}),/temperature/);
});

test('nested equipment follows rotation and cyclic support is rejected atomically',()=>{
 const w=new Studio();
 applied(w,[{type:'spawn_asset',assetId:'table',id:'inner-table',position:[0,0,0]},
   {type:'place_asset',entityId:'inner-table',supportId:'table-1',affordanceId:'top',localOffset:[0,0,0]},
   {type:'place_asset',entityId:'goniometer-1',supportId:'inner-table',affordanceId:'top',localOffset:[.2,0,0]}]);
 const initial=w.snapshot();
 assert.throws(()=>applied(w,[{type:'place_asset',entityId:'table-1',supportId:'inner-table',affordanceId:'top',localOffset:[0,0,0]}]),/lingkaran/);
 assert.deepEqual(w.snapshot(),initial);
 applied(w,[{type:'rotate_entity',entityId:'table-1',rotation:[0,Math.PI/2,0]}]);
 const goniometer=w.scene.entities.find(e=>e.id==='goniometer-1');
 assert.ok(near(goniometer.rotation[1],Math.PI/2));
 assert.ok(near(goniometer.position[2],-1.75));
});
