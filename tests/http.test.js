import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

function wait(ms){return new Promise(r=>setTimeout(r,ms));}
async function waitReady(url){for(let i=0;i<45;i++){try{const r=await fetch(url+'/health');if(r.ok)return;}catch{}await wait(80);}throw Error('HTTP server did not start');}
test('HTTP API + JSON-RPC MCP + persistence + token checks',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'osce-http-'));
 const port=49121+Math.floor(Math.random()*1000),url=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),STUDIO_DATA:path.join(root,'state.json'),API_TOKEN:'test-token'},stdio:['ignore','pipe','pipe']});
 try{
  await waitReady(url);
  const unauthorized=await fetch(url+'/api/state');assert.equal(unauthorized.status,401);
  const headers={'Content-Type':'application/json',Authorization:'Bearer test-token'};
  const state=await (await fetch(url+'/api/state',{headers})).json();assert.equal(state.scene.revision,0);
  const res=await fetch(url+'/api/operations',{method:'POST',headers,body:JSON.stringify({baseRevision:0,operations:[{type:'set_joint',entityId:'doctor',joint:'leftElbow',axis:'flexion',angle:75}]})});
  assert.equal(res.status,200);assert.equal((await res.json()).revision,1);
  const conflict=await fetch(url+'/api/operations',{method:'POST',headers,body:JSON.stringify({baseRevision:0,operations:[{type:'rename_scene',title:'Should not overwrite'}]})});assert.equal(conflict.status,409);
  const mcp=await fetch(url+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:31,method:'tools/call',params:{name:'get_world_state',arguments:{}}})});
  assert.equal(mcp.status,200);const payload=await mcp.json();assert.equal(payload.result.structuredContent.scene.revision,1);
  assert.equal(fs.existsSync(path.join(root,'state.json')),true);
  const undo=await (await fetch(url+'/api/undo',{method:'POST',headers,body:'{}'})).json();assert.equal(undo.revision,2);
 }finally{child.kill('SIGTERM');fs.rmSync(root,{recursive:true,force:true});}
});
