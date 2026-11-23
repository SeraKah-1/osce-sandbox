import test from 'node:test';import assert from 'node:assert/strict';import {spawn} from 'node:child_process';
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(base){for(let i=0;i<70;i++){try{if((await fetch(base+'/health')).ok)return}catch{}await wait(60)}throw Error('server did not start')}
test('MCP write emits event for the active tablet session, not for other sessions',async()=>{
 const port=53000+Math.floor(Math.random()*1000),base=`http://127.0.0.1:${port}`;
 const child=spawn(process.execPath,['server/index.js'],{cwd:new URL('..',import.meta.url).pathname,env:{...process.env,HOST:'127.0.0.1',PORT:String(port),API_TOKEN:'event-secret'},stdio:'ignore'});
 const headers={'Content-Type':'application/json',Authorization:'Bearer event-secret'};const ctrl=new AbortController();
 try{
  await ready(base);
  const a=await (await fetch(base+'/api/session',{method:'POST',headers,body:'{}'})).json();
  const b=await (await fetch(base+'/api/session',{method:'POST',headers,body:'{}'})).json();
  const hA={...headers,'X-Studio-Session':a.sessionId};
  const eventResponse=await fetch(base+'/api/events',{headers:hA,signal:ctrl.signal});
  assert.equal(eventResponse.status,200);const reader=eventResponse.body.getReader();
  const first=await reader.read();assert.match(new TextDecoder().decode(first.value),/connected/);
  // Modify session B first: A stream should remain untouched.
  const bEdit=await fetch(base+'/api/operations',{method:'POST',headers:{...headers,'X-Studio-Session':b.sessionId},body:JSON.stringify({baseRevision:0,operations:[{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:10}]})});assert.equal(bEdit.status,200);
  const rpc=await fetch(base+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'apply_scene_operations',arguments:{sessionId:a.sessionId,baseRevision:0,operations:[{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:40}]}}})});
  assert.equal(rpc.status,200);assert.equal((await rpc.json()).result.structuredContent.revision,1);
  const next=await Promise.race([reader.read(),wait(1500).then(()=>{throw Error('missing MCP scene event')})]);
  const event=new TextDecoder().decode(next.value);
  assert.match(event,/event: scene_updated/);assert.match(event,/"revision":1/);
  const state=await (await fetch(base+'/api/state',{headers:hA})).json();
  assert.equal(state.scene.entities.find(x=>x.id==='patient').pose.rightElbow.flexion,40);
 }finally{ctrl.abort();child.kill('SIGTERM');}
});
