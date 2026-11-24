import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function openPort(){const s=net.createServer();await new Promise((r,j)=>s.listen(0,'127.0.0.1',r).on('error',j));const port=s.address().port;await new Promise(r=>s.close(r));return port;}
async function boot(root,dir,port){
 const child=spawn(process.execPath,['server/index.js'],{cwd:root,env:{...process.env,PORT:String(port),HOST:'127.0.0.1',ENVIRONMENT_DATA_DIR:dir,API_TOKEN:'test-only-v11-key'},stdio:['ignore','pipe','pipe']});
 let errors='';child.stderr.on('data',c=>errors+=c);
 for(let i=0;i<90;i++){
  if(child.exitCode!==null)throw Error('Server failed: '+errors);
  try{const r=await fetch(`http://127.0.0.1:${port}/health`);if(r.ok)return child;}catch{}
  await delay(55);
 }
 child.kill();throw Error('Server did not start: '+errors);
}
async function stop(child){child.kill('SIGTERM');for(let i=0;i<35;i++){if(child.exitCode!==null)return;await delay(40)}child.kill('SIGKILL');}

test('live MCP creates a mechanical lesson, emits scene deltas and retries safely',async()=>{
 const root=new URL('..',import.meta.url).pathname,dir=fs.mkdtempSync(path.join(os.tmpdir(),'osce-v11-http-'));
 const port=await openPort(),base=`http://127.0.0.1:${port}`,header={Authorization:'Bearer test-only-v11-key','Content-Type':'application/json'};
 let child=null,environmentId=null,sessionId=null;
 const send=async(name,args={})=>{
  const r=await fetch(base+'/mcp',{method:'POST',headers:header,body:JSON.stringify({jsonrpc:'2.0',method:'tools/call',id:6,params:{name,arguments:args}})});
  assert.equal(r.status,200);const response=(await r.json()).result;
  if(response.isError)throw Error(response.content?.[0]?.text);
  return response.structuredContent;
 };
 try{
  child=await boot(root,dir,port);
  assert.equal((await fetch(base+'/api/environments')).status,401);
  const env=await send('create_environment',{name:'Uji instrumen v1.1'});environmentId=env.environment.id;
  const live=await send('load_environment',{environmentId});sessionId=live.sessionId;
  const asset={id:'gadget-v11',name:'Alat mekanik penguji',parts:[
   {id:'body',shape:'box',position:[0,0,0],size:[.3,.1,.2],color:'#c3dbe4'},
   {id:'lever',shape:'box',position:[.12,0,0],size:[.3,.04,.05],color:'#e8be9f'},
   {id:'indicator',shape:'box',position:[0,.1,0],size:[.06,.02,.1],color:'#6a98b1'}
  ],anchors:[{id:'tip',partId:'lever',position:[.12,0,0]}],mechanisms:[
   {id:'lever-h',label:'Tuas',kind:'hinge',partIds:['lever'],pivot:[0,0,0],axis:[0,1,0],min:0,max:180,initial:0,drives:[{mechanismId:'indicator-d',ratio:.5,offset:0}]},
   {id:'indicator-d',label:'Indikator',kind:'dial',partIds:['indicator'],pivot:[0,0,0],axis:[0,1,0],min:0,max:90,initial:0}
  ],learning:{title:'Latihan kontak mekanis',steps:[
   {id:'align',instruction:'Tarik ujung alat mendekati target yang ditentukan.',condition:{kind:'distance',targetId:'patient',anchorId:'tip',targetAnchor:'chest',maxDistance:.3}},
   {id:'hold',instruction:'Pertahankan tuas di 40 derajat selama setengah detik.',condition:{kind:'hold',durationMs:500,predicate:{kind:'mechanism_range',mechanismId:'lever-h',min:38,max:42}}}
  ]}};
  const created=await send('create_asset',{sessionId,...asset});assert.equal(created.autoSaved,true);
  let world=await send('get_world_state',{sessionId});
  const op={type:'spawn_asset',id:'gadget-instance',assetId:asset.id,position:[0,1,0]};
  const first=await send('apply_scene_operations',{sessionId,baseRevision:world.scene.revision,operationId:'create:gadget-instance:v11',operations:[op]});
  assert.equal(first.autoSaved,true);
  const repeated=await send('apply_scene_operations',{sessionId,baseRevision:world.scene.revision,operationId:'create:gadget-instance:v11',operations:[op]});
  assert.equal(repeated.deduplicated,true);
  world=await send('get_world_state',{sessionId});
  const second=await send('apply_scene_operations',{sessionId,baseRevision:world.scene.revision,operationId:'update:gadget-instance:v11',operations:[{type:'set_mechanism',entityId:'gadget-instance',mechanismId:'lever-h',value:80}]});
  assert.equal(second.delta.upserts.find(e=>e.id==='gadget-instance').controls['indicator-d'],40);
  const saved=await send('get_environment',{environmentId});assert.equal(saved.snapshot.assets.find(x=>x.id==='gadget-v11').learning.steps.length,2);
  const r=await fetch(base+'/api/state',{headers:{...header,'X-Studio-Session':sessionId}});const scene=(await r.json()).scene;
  assert.equal(scene.entities.find(e=>e.id==='gadget-instance').controls['lever-h'],80);
  const other=await fetch(base+'/api/session',{method:'POST',headers:header,body:'{}'});const otherState=await other.json();
  assert.equal(otherState.scene.entities.some(e=>e.id==='gadget-instance'),false);
  await send('delete_environment',{environmentId,confirmed:true});environmentId=null;
 }finally{
  if(environmentId)await send('delete_environment',{environmentId,confirmed:true}).catch(()=>{});
  if(child)await stop(child);
  fs.rmSync(dir,{recursive:true,force:true});
 }
});
