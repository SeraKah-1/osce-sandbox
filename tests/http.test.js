import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(url){for(let i=0;i<50;i++){try{if((await fetch(url+'/health')).ok)return;}catch{}await wait(75);}throw Error('server failed');}
test('HTTP session remains in RAM, isolates clients, resets on close and requires token',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'osce-ephemeral-'));
 const port=49200+Math.floor(Math.random()*2000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),API_TOKEN:'secret',STUDIO_DATA:path.join(dir,'SHOULD_NOT_EXIST.json')},stdio:['ignore','pipe','pipe']});
 try{
  await ready(base);
  assert.equal((await fetch(base+'/api/session',{method:'POST'})).status,401);
  const headers={'Content-Type':'application/json',Authorization:'Bearer secret'};
  const a=await (await fetch(base+'/api/session',{method:'POST',headers,body:'{}'})).json();
  const b=await (await fetch(base+'/api/session',{method:'POST',headers,body:'{}'})).json();
  assert.ok(a.sessionId&&b.sessionId&&a.sessionId!==b.sessionId);
  assert.equal(a.scene.revision,0);assert.equal(b.scene.revision,0);
  const hA={...headers,'X-Studio-Session':a.sessionId};const hB={...headers,'X-Studio-Session':b.sessionId};
  const p=await fetch(base+'/api/operations',{method:'POST',headers:hA,body:JSON.stringify({baseRevision:0,operations:[{type:'set_joint',entityId:'doctor',joint:'leftElbow',axis:'flexion',angle:75}]})});
  assert.equal(p.status,200);assert.equal((await p.json()).revision,1);
  const sceneA=await (await fetch(base+'/api/state',{headers:hA})).json();
  const sceneB=await (await fetch(base+'/api/state',{headers:hB})).json();
  assert.equal(sceneA.scene.entities[0].pose.leftElbow.flexion,75);
  assert.equal(sceneB.scene.entities[0].pose.leftElbow.flexion,0);
  assert.equal(fs.existsSync(path.join(dir,'SHOULD_NOT_EXIST.json')),false);
  const stale=await fetch(base+'/api/operations',{method:'POST',headers:hA,body:JSON.stringify({baseRevision:0,operations:[{type:'rename_scene',title:'stale'}]})});
  assert.equal(stale.status,409);
  assert.equal((await fetch(base+'/api/session',{method:'DELETE',headers:hA})).status,200);
  assert.equal((await fetch(base+'/api/state',{headers:hA})).status,410);
  assert.equal((await fetch(base+'/api/state',{headers:hB})).status,200);
  assert.equal((await fetch(base+'/api/save',{method:'POST',headers:hB,body:'{}'})).status,410);
 }finally{child.kill('SIGTERM');fs.rmSync(dir,{recursive:true,force:true});}
});
