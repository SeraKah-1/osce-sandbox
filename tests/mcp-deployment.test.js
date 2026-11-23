import test from 'node:test';import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
async function ready(base){for(let i=0;i<70;i++){try{if((await fetch(base+'/health')).ok)return;}catch{}await new Promise(r=>setTimeout(r,70));}throw Error('Server not ready');}
test('MCP session targets transient tablet world and custom equipment, no disk writes',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'osce-mcp-'));
 const port=52000+Math.floor(Math.random()*3000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),API_TOKEN:'mcp-secret',STUDIO_DATA:path.join(dir,'SHOULD_NOT_EXIST.json')},stdio:['ignore','pipe','pipe']});
 const headers={'Content-Type':'application/json',Authorization:'Bearer mcp-secret'};let id=0;
 const rpc=async(method,params={})=>{const res=await fetch(base+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:++id,method,params})});assert.equal(res.status,200);const p=await res.json();assert.ok(p.result);return p.result;};
 const tool=(name,args={})=>rpc('tools/call',{name,arguments:args});
 try{
  await ready(base);
  const init=await rpc('initialize');assert.equal(init.serverInfo.name,'osce-sandbox-studio');
  const resources=await rpc('resources/list');assert.equal(resources.resources.length,1);
  assert.match((await rpc('resources/read',{uri:resources.resources[0].uri})).contents[0].text,/function createRenderer/);
  const list=(await rpc('tools/list')).tools;assert.equal(list.some(x=>x.name==='save_scene'),false);
  const opened=(await tool('open_studio')).structuredContent;const sessionId=opened.sessionId;assert.ok(sessionId);
  const target=extra=>({...extra,sessionId});
  let r=await tool('create_behavior',target({id:'switch-e2e',name:'Demo switch',states:['off','on'],initial:'off',transitions:[{from:'off',action:'on',to:'on',label:'Activate'},{from:'on',action:'off',to:'off',label:'Deactivate'}],visuals:{on:{color:'#33bb77'}}}));assert.equal(r.isError,false);
  r=await tool('create_asset',target({id:'e2e-asset',name:'New instrument',behaviorId:'switch-e2e',parts:[{shape:'box',position:[0,0,0],size:[.2,.1,.1],color:'#336699'}]}));assert.equal(r.isError,false);
  let rev=(await tool('get_world_state',target({}))).structuredContent.scene.revision;
  r=await tool('apply_scene_operations',target({baseRevision:rev,operations:[{type:'spawn_asset',id:'e2e-tool',assetId:'e2e-asset',position:[0,.5,0]}]}));assert.equal(r.isError,false);
  rev=r.structuredContent.revision;
  r=await tool('apply_scene_operations',target({baseRevision:rev,operations:[{type:'trigger_action',entityId:'e2e-tool',action:'on'}]}));assert.equal(r.isError,false);
  const world=(await tool('open_studio',target({}))).structuredContent;
  assert.equal(world.scene.entities.find(e=>e.id==='e2e-tool').status,'on');
  assert.equal(world.behaviors.find(b=>b.id==='switch-e2e').visuals.on.color,'#33bb77');
  const fresh=(await tool('open_studio')).structuredContent;
  assert.ok(fresh.sessionId!==sessionId);
  assert.equal(fresh.scene.entities.some(e=>e.id==='e2e-tool'),false);
  assert.equal(fs.existsSync(path.join(dir,'SHOULD_NOT_EXIST.json')),false);
  assert.equal((await fetch(base+'/widget')).status,200);
  assert.equal((await fetch(base+'/mcp',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
 }finally{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
});
