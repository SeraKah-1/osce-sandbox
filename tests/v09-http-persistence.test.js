import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function start(root,dir,port){
 const child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),API_TOKEN:'v09-test-token',ENVIRONMENT_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});
 let stderr='';child.stderr.on('data',c=>{stderr+=c.toString()});
 for(let i=0;i<100;i++){
   if(child.exitCode!==null)throw Error('Server crashed '+stderr);
   try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return child;}catch{}
   await wait(60);
 }
 child.kill();throw Error('Server did not start '+stderr);
}
async function stop(child){child.kill('SIGTERM');for(let i=0;i<40;i++){if(child.exitCode!==null)return;await wait(50)}child.kill('SIGKILL')}

test('real HTTP MCP autosaves GPT environments across process restart, deletes permanently and isolates sessions',async()=>{
 const root=new URL('..',import.meta.url).pathname,dir=fs.mkdtempSync(path.join(os.tmpdir(),'osce-http-v09-'));
 const port=54800+Math.floor(Math.random()*2000),url=`http://127.0.0.1:${port}`;
 const auth={Authorization:'Bearer v09-test-token','Content-Type':'application/json'};let child;
 let n=0;const mcp=async(name,args={})=>{
   const r=await fetch(url+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:++n,method:'tools/call',params:{name,arguments:args}})});
   assert.equal(r.status,200);const out=(await r.json()).result;
   if(out.isError)throw Error(out.content?.[0]?.text);return out.structuredContent;
 };
 try{
   child=await start(root,dir,port);
   const unauthorized=await fetch(url+'/api/environments');assert.equal(unauthorized.status,401);
   const created=await mcp('create_environment',{name:'Ruangan pemeriksaan bahu',operations:[{type:'rename_scene',title:'Ruang Shoulder'}]});
   const environmentId=created.environment.id;
   assert.ok(fs.existsSync(path.join(dir,environmentId+'.json')));
   const loaded=await mcp('load_environment',{environmentId});const sessionId=loaded.sessionId;
   let state=await mcp('get_world_state',{sessionId});
   const liveRev=state.scene.revision;
   const ui=await fetch(url+'/api/operations',{method:'POST',headers:{...auth,'X-Studio-Session':sessionId},body:JSON.stringify({baseRevision:liveRev,operations:[{type:'move_entity',entityId:'patient',position:[7,0,0]}]})});
   assert.equal(ui.status,200); // drag gesture is transient
   state=await mcp('get_world_state',{sessionId});
   const edit=await mcp('apply_scene_operations',{sessionId,baseRevision:state.scene.revision,operations:[{type:'spawn_asset',assetId:'chair',position:[4,0,1]}]});
   assert.equal(edit.autoSaved,true);
   const liveChair=edit.result[0].id;
   const saved=await mcp('get_environment',{environmentId});
   assert.equal(saved.snapshot.scene.entities.find(e=>e.id===liveChair).assetId,'chair');
   assert.deepEqual(saved.snapshot.scene.entities.find(e=>e.id==='patient').position,[-.2,0,0]);
   await fetch(url+'/api/session',{method:'DELETE',headers:{...auth,'X-Studio-Session':sessionId}});
   await stop(child);child=null;
   child=await start(root,dir,port);
   const list=await mcp('list_environments');assert.equal(list.environments.length,1);
   const reopened=await mcp('load_environment',{environmentId});
   assert.equal(reopened.scene.entities.find(e=>e.id===liveChair).assetId,'chair');
   assert.deepEqual(reopened.scene.entities.find(e=>e.id==='patient').position,[-.2,0,0]);
   const missingSession=await fetch(url+'/mcp',{method:'POST',headers:auth,body:JSON.stringify({jsonrpc:'2.0',id:301,method:'tools/call',params:{name:'get_world_state',arguments:{}}})});
   assert.equal((await missingSession.json()).result.isError,true);
   const deletion=await mcp('delete_environment',{environmentId,confirmed:true});assert.equal(deletion.deleted,true);
   assert.equal(fs.existsSync(path.join(dir,environmentId+'.json')),false);
   assert.equal((await mcp('list_environments')).environments.length,0);
 }finally{if(child)await stop(child);fs.rmSync(dir,{recursive:true,force:true})}
});
