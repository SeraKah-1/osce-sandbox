import test from 'node:test';
import assert from 'node:assert/strict';
import {makeStudio} from '../server/core.js';
import {rpc,toolsList} from '../server/mcp.js';
import {WIDGET_URI,widgetHTML} from '../server/widget.js';
const studio=makeStudio();
const send=(method,params={})=>rpc(studio,{jsonrpc:'2.0',id:17,method,params});

test('MCP Apps UI is a registered HTML resource bound to an executable tool',()=>{
 const r=send('resources/list').result.resources;
 assert.ok(r.find(v=>v.uri===WIDGET_URI&&v.mimeType==='text/html;profile=mcp-app'));
 const tool=toolsList.find(v=>v.name==='open_studio');
 assert.equal(tool._meta.ui.resourceUri,WIDGET_URI);
 const resource=send('resources/read',{uri:WIDGET_URI}).result.contents[0];
 assert.equal(resource.mimeType,'text/html;profile=mcp-app');
 assert.match(resource.text,/canvas id="scene3d"/);
 assert.match(resource.text,/window.openai\?\.callTool/);
 assert.match(resource.text,/function createRenderer/);
 assert.ok(resource.text.length>25000);
 const open=send('tools/call',{name:'open_studio',arguments:{}}).result;
 assert.equal(open.structuredContent.scene.id,'main');
 assert.equal(open._meta.ui.resourceUri,WIDGET_URI);
});

test('validated MCP-created instrument changes scene and actually attaches/changes visual state',()=>{
 const create=(name,arguments_)=>send('tools/call',{name,arguments:arguments_}).result;
 const b=create('create_behavior',{id:'widget-test-behavior',name:'Attach indicator',states:['free','attached'],initial:'free',transitions:[{from:'free',action:'connect',to:'attached',label:'Connect',effects:[{type:'attach',targetId:'patient',anchor:'rightUpperArm'}]},{from:'attached',action:'disconnect',to:'free',label:'Disconnect',effects:[{type:'detach'}]}],visuals:{attached:{color:'#ff0000',scale:1.2}}});
 assert.equal(b.isError,false);
 const a=create('create_asset',{id:'widget-test-asset',name:'New instrument',parts:[{shape:'box',position:[0,0,0],size:[.2,.1,.12],color:'#111111'}],behaviorId:'widget-test-behavior'});
 assert.equal(a.isError,false);
 let revision=studio.scene.revision;
 const spawn=create('apply_scene_operations',{baseRevision:revision,operations:[{type:'spawn_asset',id:'widget-device',assetId:'widget-test-asset',position:[0,0,1]}]});
 assert.equal(spawn.isError,false);
 revision=studio.scene.revision;
 const act=create('apply_scene_operations',{baseRevision:revision,operations:[{type:'trigger_action',entityId:'widget-device',action:'connect'}]});
 assert.equal(act.isError,false);
 let e=studio.scene.entities.find(v=>v.id==='widget-device');assert.equal(e.attachedTo,'patient');assert.equal(e.anchor,'rightUpperArm');assert.equal(e.status,'attached');
 assert.equal(studio.behaviors.find(v=>v.id==='widget-test-behavior').visuals.attached.color,'#ff0000');
 revision=studio.scene.revision;
 create('apply_scene_operations',{baseRevision:revision,operations:[{type:'trigger_action',entityId:'widget-device',action:'disconnect'}]});
 e=studio.scene.entities.find(v=>v.id==='widget-device');assert.equal(e.attachedTo,undefined);assert.equal(e.status,'free');
});

test('invalid behavior effects rejected without corrupting store',()=>{
 const before=studio.scene.revision;
 const invalid=send('tools/call',{name:'create_behavior',arguments:{id:'bad-effect',name:'Unsafe code',states:['off','on'],initial:'off',transitions:[{from:'off',action:'execute',to:'on',label:'Execute',effects:[{type:'javascript',code:'process.exit(1)'}]}]}}).result;
 assert.equal(invalid.isError,true);
 assert.equal(studio.scene.revision,before);
 assert.equal(studio.behaviors.some(x=>x.id==='bad-effect'),false);
});

test('asset and behavior preview validate against real schemas without writing',()=>{
 const a=send('tools/call',{name:'validate_asset',arguments:{asset:{id:'test-preview-asset',name:'Preview',parts:[{shape:'sphere',position:[0,0,0],size:[.1,.1,.1],color:'#abcdef'}]}}}).result;
 assert.equal(a.structuredContent.valid,true);
 assert.equal(studio.assets.some(x=>x.id==='test-preview-asset'),false);
 const invalid=send('tools/call',{name:'validate_asset',arguments:{asset:{id:'bad',name:'Broken',parts:[{shape:'unknown',position:[0,0,0],size:[.1,.1,.1],color:'#abcdef'}]}}}).result;
 assert.equal(invalid.isError,true);
});
