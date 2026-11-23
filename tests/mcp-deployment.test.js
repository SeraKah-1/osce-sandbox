import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

async function untilReady(url){for(let i=0;i<75;i++){try{const r=await fetch(url+'/health');if(r.ok)return;}catch{}await new Promise(r=>setTimeout(r,70));}throw Error('Server not ready');}

test('live HTTP MCP: create instrument + behavior, attach to patient, persist to disk, expose widget',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'osce-mcp-deployment-'));
 const port=52000+Math.floor(Math.random()*6000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),API_TOKEN:'mcp-e2e-secret',STUDIO_DATA:path.join(dir,'db.json')},stdio:['ignore','pipe','pipe']});
 const headers={'Content-Type':'application/json',Authorization:'Bearer mcp-e2e-secret'};
 let id=0;
 const mcp=async(method,params={})=>{const r=await fetch(base+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});assert.equal(r.status,200);const json=await r.json();assert.ok(json.result,'MCP result missing '+JSON.stringify(json));return json.result;};
 const tool=async(name,args)=>mcp('tools/call',{name,arguments:args});
 try{
  await untilReady(base);
  const init=await mcp('initialize',{protocolVersion:'2025-11-25',clientInfo:{name:'test',version:'1.0'},capabilities:{}});
  assert.equal(init.serverInfo.name,'osce-sandbox-studio');
  const resources=await mcp('resources/list');assert.equal(resources.resources.length,1);
  const resource=await mcp('resources/read',{uri:resources.resources[0].uri});assert.match(resource.contents[0].text,/function createRenderer/);
  const list=await mcp('tools/list');assert.ok(list.tools.some(x=>x.name==='open_studio'));
  let result=await tool('create_behavior',{id:'e2e-btn',name:'Interactive test tool',states:['free','held'],initial:'free',transitions:[{from:'free',action:'attach',to:'held',label:'Attach to patient',effects:[{type:'attach',targetId:'patient',anchor:'rightUpperArm'}]},{from:'held',action:'release',to:'free',label:'Remove',effects:[{type:'detach'}]}],visuals:{held:{color:'#33bb77',scale:1.2}}});
  assert.equal(result.isError,false);
  result=await tool('create_asset',{id:'e2e-asset',name:'Model instrument',behaviorId:'e2e-btn',parts:[{shape:'box',position:[0,0,0],size:[.2,.1,.1],color:'#336699'}]});
  assert.equal(result.isError,false);
  let rev=(await tool('get_world_state',{})).structuredContent.scene.revision;
  result=await tool('apply_scene_operations',{baseRevision:rev,operations:[{type:'spawn_asset',id:'e2e-instrument',assetId:'e2e-asset',position:[0,.5,0]}]});assert.equal(result.isError,false);
  rev=result.structuredContent.revision;
  result=await tool('apply_scene_operations',{baseRevision:rev,operations:[{type:'trigger_action',entityId:'e2e-instrument',action:'attach'}]});assert.equal(result.isError,false);
  const world=(await tool('open_studio',{})).structuredContent;
  const instrument=world.scene.entities.find(e=>e.id==='e2e-instrument');
  assert.equal(instrument.status,'held');assert.equal(instrument.attachedTo,'patient');
  assert.equal(world.behaviors.find(e=>e.id==='e2e-btn').visuals.held.color,'#33bb77');
  const saved=JSON.parse(fs.readFileSync(path.join(dir,'db.json'),'utf8'));
  assert.equal(saved.scene.entities.find(e=>e.id==='e2e-instrument').attachedTo,'patient');
  const preview=await fetch(base+'/widget');assert.equal(preview.status,200);assert.match(await preview.text(),/id="scene3d"/);
  const unauthed=await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/list'})});assert.equal(unauthed.status,401);
 }finally{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
});
