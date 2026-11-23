import test from 'node:test';
import assert from 'node:assert/strict';
import {Studio} from '../server/core.js';
import {partMatrix,transformPoint,mechanismHandle} from '../web/assembly.js';
import {hitTestPuppet,installDirectTouch} from '../web/touch-pose.js';
import {characterSkeleton} from '../web/render3d.js';
import {rpc} from '../server/mcp.js';
import {widgetHTML} from '../server/widget.js';
import {Script} from 'node:vm';
const p=(id,position,size,color='#acd3cd',shape='box')=>({id,position,size,color,shape});
const generic=()=>({id:'articulated-widget',name:'Articulated practice object',parts:[
 p('base',[0,0,0],[.3,.12,.3]),p('arm',[.30,0,0],[.35,.055,.06]),p('slide',[0,.24,0],[.18,.09,.1])],
 mechanisms:[
  {id:'hinge',label:'Hinge',kind:'hinge',partIds:['arm'],pivot:[0,0,0],axis:[0,1,0],min:-90,max:90,initial:0},
  {id:'slide',label:'Slide',kind:'slider',partIds:['slide'],pivot:[0,0,0],axis:[1,0,0],min:0,max:.2,initial:0}
 ]});
const applied=(s,operations)=>s.apply(operations,s.scene.revision);
const close=(a,b,eps=1e-5)=>Math.abs(a-b)<eps;

test('MCP can create multi-part articulated equipment; no hard-coded tool-specific behavior',()=>{
 const s=new Studio(),a=generic();assert.equal(s.createAsset(a).ok,true);
 applied(s,[{type:'spawn_asset',id:'device',assetId:a.id,position:[0,0,0]}]);
 const e=s.scene.entities.find(e=>e.id==='device');assert.deepEqual(e.controls,{hinge:0,slide:0});
 applied(s,[{type:'set_mechanism',entityId:'device',mechanismId:'hinge',value:90},
            {type:'set_mechanism',entityId:'device',mechanismId:'slide',value:.15}]);
 assert.deepEqual(e.controls,{hinge:90,slide:.15});
 const r=transformPoint(partMatrix(s.assets.find(x=>x.id===a.id),e,a.parts[1]),[0,0,0]);
 assert.ok(close(r[0],0)&&close(r[2],-.30),JSON.stringify(r));
 const sl=transformPoint(partMatrix(s.assets.find(x=>x.id===a.id),e,a.parts[2]));
 assert.ok(close(sl[0],.15));
 s.historyMove('undo');assert.deepEqual(e.controls,{hinge:90,slide:.15}); // old reference is stale after snapshot restore
 assert.deepEqual(s.scene.entities.find(x=>x.id==='device').controls,{hinge:0,slide:0});
 s.historyMove('redo');assert.deepEqual(s.scene.entities.find(x=>x.id==='device').controls,{hinge:90,slide:.15});
});

test('macro rotation works on characters and furniture with 3D radian transforms',()=>{
 const s=new Studio();applied(s,[{type:'rotate_entity',entityId:'patient',rotation:[.3,1.2,-.1]},{type:'rotate_entity',entityId:'bed-1',rotation:[0,.8,0]}]);
 assert.deepEqual(s.scene.entities.find(x=>x.id==='patient').rotation,[.3,1.2,-.1]);
 assert.equal(s.scene.entities.find(x=>x.id==='bed-1').rotation[1],.8);
 assert.throws(()=>applied(s,[{type:'rotate_entity',entityId:'patient',rotation:[1,NaN,0]}]),/Rotasi/);
});

test('nested mechanisms propagate parent rotation and local sliding',()=>{
 const a=generic();a.mechanisms[1].parentId='hinge';const s=new Studio();s.createAsset(a);applied(s,[{type:'spawn_asset',assetId:a.id,id:'nested',position:[0,0,0]}]);
 applied(s,[{type:'set_mechanism',entityId:'nested',mechanismId:'hinge',value:90},
            {type:'set_mechanism',entityId:'nested',mechanismId:'slide',value:.1}]);
 const e=s.scene.entities.find(x=>x.id==='nested'),actual=transformPoint(partMatrix(s.assets.find(x=>x.id===a.id),e,a.parts[2]));
 assert.ok(close(actual[0],0)&&close(actual[2],-.1),JSON.stringify(actual));
});

test('button micro operation drives real behavior when reaching limit, without duplicate triggers',()=>{
 const s=new Studio();s.createBehavior({id:'state-control',name:'Generic state',states:['off','on'],initial:'off',transitions:[
  {from:'off',to:'on',action:'press',label:'Press'},
  {from:'on',to:'off',action:'release',label:'Release'}
 ]});
 const a=generic();a.id='action-device';a.behaviorId='state-control';a.parts.push(p('button',[0,.20,0],[.1,.03,.1]));
 a.mechanisms.push({id:'button',label:'Action button',kind:'button',partIds:['button'],pivot:[0,.20,0],axis:[0,-1,0],min:0,max:.025,initial:0,triggers:{max:'press',min:'release'}});
 s.createAsset(a);applied(s,[{type:'spawn_asset',assetId:a.id,id:'tester',position:[0,0,0]}]);
 applied(s,[{type:'set_mechanism',entityId:'tester',mechanismId:'button',value:.025}]);
 let e=s.scene.entities.find(e=>e.id==='tester');assert.equal(e.status,'on');assert.equal(e.controls.button,.025);
 applied(s,[{type:'set_mechanism',entityId:'tester',mechanismId:'button',value:.025}]);assert.equal(e.status,'on');
 applied(s,[{type:'set_mechanism',entityId:'tester',mechanismId:'button',value:0}]);assert.equal(e.status,'off');
 assert.throws(()=>applied(s,[{type:'set_mechanism',entityId:'tester',mechanismId:'button',value:-.5}]),/luar batas/);
});

test('invalid AI asset definitions reject cycles, duplicate part ownership, impossible axes and unknown triggers',()=>{
 const s=new Studio();
 const dup=generic();dup.id='dup';dup.mechanisms[1].partIds=['arm'];assert.throws(()=>s.createAsset(dup),/satu mekanisme/);
 const cycle=generic();cycle.id='cycle';cycle.mechanisms[0].parentId='slide';cycle.mechanisms[1].parentId='hinge';assert.throws(()=>s.createAsset(cycle),/siklus/);
 const axis=generic();axis.id='axis';axis.mechanisms[0].axis=[0,0,0];assert.throws(()=>s.createAsset(axis),/mekanisme/);
 const ref=generic();ref.id='missing';ref.mechanisms[0].partIds=['unknown'];assert.throws(()=>s.createAsset(ref),/mekanisme/);
 const trigger=generic();trigger.id='missing-action';trigger.mechanisms[0].triggers={max:'start'};assert.throws(()=>s.createAsset(trigger),/behaviorId/);
});

test('tube paths, curved ring, capsule, cone and rotated parts are accepted but broken paths fail',()=>{
 const s=new Studio(),a={id:'multi-geometry',name:'Multi geometry',parts:[
  p('ring',[0,0,0],[.22,.05,.22],'#aabbcc','torus'),
  p('cap',[0,.3,0],[.11,.3,.11],'#aabbcc','capsule'),
  p('tip',[.1,0,0],[.11,.1,.11],'#aabbcc','cone'),
  {...p('hose',[0,.1,0],[.03,.2,.03],'#aabbcc','tube'),points:[[0,0,0],[.2,.1,0],[.4,0,.1]],rotation:[.2,0,0]}
 ]};
 assert.equal(s.validateAssetDraft(a).valid,true);
 const broken=structuredClone(a);broken.id='broken-geom';broken.parts[3].points=[[0,0,0]];
 assert.throws(()=>s.createAsset(broken),/Tube/);
});

test('micro operation preview is transaction-free and restore validates component values',()=>{
 const s=new Studio();s.createAsset(generic());applied(s,[{type:'spawn_asset',assetId:'articulated-widget',id:'restore-one',position:[0,0,0]}]);
 const rev=s.scene.revision,preview=s.preview([{type:'set_mechanism',entityId:'restore-one',mechanismId:'hinge',value:60}],rev);
 assert.ok(preview.summary.modified.includes('restore-one'));assert.equal(s.scene.revision,rev);
 const good=s.snapshot();applied(s,[{type:'set_mechanism',entityId:'restore-one',mechanismId:'hinge',value:60}]);s.restore(good,s.scene.revision);
 assert.equal(s.scene.entities.find(e=>e.id==='restore-one').controls.hinge,0);
 const bad=structuredClone(good);bad.scene.entities.find(e=>e.id==='restore-one').controls.hinge=999;
 assert.throws(()=>s.restore(bad,s.scene.revision),/mekanisme snapshot/);
});

test('touch micro hit zones target a real component and emit a set_mechanism operation',()=>{
 const s=new Studio();s.createAsset(generic());applied(s,[{type:'spawn_asset',id:'detail',assetId:'articulated-widget',position:[0,0,0]}]);
 const world=s.snapshot();world.scene.entities=world.scene.entities.filter(e=>e.id==='detail');
 const project=p=>({x:300+p[0]*100,y:300-p[1]*100,z:.2,visible:true}),getPos=e=>e.position;
 const e=world.scene.entities[0],m=world.assets.find(x=>x.id===e.assetId).mechanisms[0];
 const h=mechanismHandle(world.assets.find(x=>x.id===e.assetId),e,m);
 const hit=hitTestPuppet(world,project,characterSkeleton,getPos,project(h),'detail');
 assert.equal(hit?.kind,'micro');assert.equal(hit.target.mechanismId,'hinge');
 const listeners={};const canvas={style:{},clientWidth:900,clientHeight:650,getBoundingClientRect(){return {left:0,top:0}},setPointerCapture(){},addEventListener(n,fn){listeners[n]=fn},removeEventListener(n){delete listeners[n]}};
 const actions=[];const touch=installDirectTouch({canvas,getWorld:()=>world,project,skeleton:characterSkeleton,assetPosition:getPos,
 camera:{azimuth:.6,elevation:.45,distance:5,target:[0,0,0]},getDetailSelection:()=> 'detail',
 onCommit:ops=>actions.push(...ops)});
 const dispatch=(n,x,y)=>listeners[n]?.({pointerId:1,pointerType:'touch',button:0,clientX:x,clientY:y,preventDefault(){},type:n,deltaY:0});
 const start=project(h);dispatch('pointerdown',start.x,start.y);dispatch('pointermove',start.x+55,start.y);dispatch('pointerup',start.x+55,start.y);
 touch.destroy();assert.ok(actions.some(o=>o.type==='set_mechanism'&&o.mechanismId==='hinge'&&o.value>0),JSON.stringify(actions));
});

test('right mouse drag rotates whole object as one undoable operation',()=>{
 const s=new Studio();const world=s.snapshot();world.scene.entities=world.scene.entities.filter(e=>e.id==='patient');
 const listeners={};const canvas={style:{},clientWidth:900,clientHeight:650,getBoundingClientRect(){return {left:0,top:0}},setPointerCapture(){},addEventListener(n,fn){listeners[n]=fn},removeEventListener(n){delete listeners[n]}};
 const project=p=>({x:420+p[0]*90,y:290-p[1]*90,z:.2,visible:true}),pos=e=>e.position,actions=[];
 const touch=installDirectTouch({canvas,getWorld:()=>world,project,skeleton:characterSkeleton,assetPosition:pos,
 camera:{azimuth:.6,elevation:.5,distance:5,target:[0,0,0]},onCommit:ops=>actions.push(...ops)});
 const chest=project(characterSkeleton(world.scene.entities[0]).joints.chest);
 for(const [n,x,y] of [['pointerdown',chest.x,chest.y],['pointermove',chest.x+50,chest.y+12],['pointerup',chest.x+50,chest.y+12]])listeners[n]({pointerId:4,pointerType:'mouse',button:2,clientX:x,clientY:y,type:n,preventDefault(){}});
 touch.destroy();assert.ok(actions.some(o=>o.type==='rotate_entity'&&o.entityId==='patient'&&Math.abs(o.rotation[1])>.2),JSON.stringify(actions));
});

test('MCP exposes articulated schemas, set_mechanism operation and a valid bundled widget',()=>{
 const s=new Studio(),list=rpc(s,{jsonrpc:'2.0',method:'tools/list',id:8}).result.tools;
 const a=list.find(x=>x.name==='create_asset');assert.ok(a.inputSchema.properties.mechanisms);assert.ok(a.inputSchema.properties.parts.items.properties.points);
 assert.match(list.find(x=>x.name==='apply_scene_operations').description,/set_mechanism/);
 const html=widgetHTML();const script=html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
 assert.ok(script?.includes('__assembly')&&script.includes('setDetailMode'));
 assert.doesNotThrow(()=>new Script(script));
});

test('tapping a detail button is not undone by the touch commit path',()=>{
 const s=new Studio();const a=generic();a.id='tap-tool';a.parts.push(p('button',[0,.42,0],[.1,.02,.1]));
 a.mechanisms.push({id:'button',label:'Tap Button',kind:'button',partIds:['button'],pivot:[0,.42,0],axis:[0,-1,0],min:0,max:.02,initial:0});
 s.createAsset(a);applied(s,[{type:'spawn_asset',id:'tap-instance',assetId:a.id,position:[0,0,0]}]);
 const world=s.snapshot();world.scene.entities=world.scene.entities.filter(x=>x.id==='tap-instance');
 const listeners={},canvas={style:{},clientWidth:900,clientHeight:650,getBoundingClientRect(){return {left:0,top:0}},setPointerCapture(){},addEventListener(n,fn){listeners[n]=fn},removeEventListener(n){delete listeners[n]}},actions=[];
 const project=v=>({x:250+v[0]*120,y:270-v[1]*120,z:.1,visible:true}),getPos=e=>e.position;
 const touch=installDirectTouch({canvas,getWorld:()=>world,project,skeleton:characterSkeleton,assetPosition:getPos,camera:{azimuth:.6,elevation:.4,distance:5,target:[0,0,0]},getDetailSelection:()=> 'tap-instance',onCommit:ops=>actions.push(...ops)});
 const e=world.scene.entities[0],def=world.assets.find(x=>x.id===a.id),h=project(mechanismHandle(def,e,a.mechanisms[2]));
 for(const n of ['pointerdown','pointerup'])listeners[n]({pointerId:1,pointerType:'touch',button:0,clientX:h.x,clientY:h.y,type:n,preventDefault(){}});
 touch.destroy();assert.equal(e.controls.button,.02);assert.deepEqual(actions,[{type:'set_mechanism',entityId:'tap-instance',mechanismId:'button',value:.02}]);
});

test('updating an instantiated articulated asset cannot remove live mechanisms',()=>{
 const s=new Studio();s.createAsset(generic());applied(s,[{type:'spawn_asset',id:'ref',assetId:'articulated-widget',position:[0,0,0]}]);
 assert.throws(()=>s.updateAsset('articulated-widget',{mechanisms:[]}),/masih dipakai|sedang dipakai|tidak kompatibel/);
 assert.equal(s.assets.find(x=>x.id==='articulated-widget').mechanisms.length,2);
});

test('micro action failure rolls back both mechanism position and device status',()=>{
 const s=new Studio();s.createBehavior({id:'oneway',name:'One way',states:['idle','locked'],initial:'idle',transitions:[{from:'idle',to:'locked',action:'engage',label:'Engage'}]});
 const a=generic();a.id='locked-widget';a.behaviorId='oneway';a.mechanisms[0].triggers={max:'engage'};
 s.createAsset(a);applied(s,[{type:'spawn_asset',assetId:a.id,id:'locked-item',position:[0,0,0]}]);
 applied(s,[{type:'set_mechanism',entityId:'locked-item',mechanismId:'hinge',value:90}]);
 applied(s,[{type:'set_mechanism',entityId:'locked-item',mechanismId:'hinge',value:80}]);
 const rev=s.scene.revision;
 assert.throws(()=>applied(s,[{type:'set_mechanism',entityId:'locked-item',mechanismId:'hinge',value:90}]),/tidak tersedia/);
 const e=s.scene.entities.find(x=>x.id==='locked-item');assert.equal(e.controls.hinge,80);assert.equal(e.status,'locked');assert.equal(s.scene.revision,rev);
});
