import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath,['scripts/build-sites.mjs']);
const {default:worker}=await import('../dist/server/index.js');
const {SiteSessions}=await import('../dist/server/site-sessions.js');

function fixture() {
  const objects=new Map([['projects/a.json',{etag:'old',body:'archived scene'}]]);
  const background=[];
  let version=0;
  const bucket={
    async get(key){
      const object=objects.get(key);
      return object && {etag:object.etag,json:async()=>JSON.parse(object.body)};
    },
    async head(key){return objects.get(key)??null;},
    async put(key,body,{onlyIf,customMetadata}){
      const existing=objects.get(key);
      if(onlyIf instanceof Headers ? existing : existing?.etag!==onlyIf.etagMatches)return null;
      const object={etag:String(++version),body:typeof body==='string'?body:new TextDecoder().decode(body),customMetadata};
      objects.set(key,object);
      return object;
    },
    async delete(keys){for(const key of [keys].flat())objects.delete(key);},
    async list({prefix}){return {objects:[...objects.keys()].filter(key=>key.startsWith(prefix)).sort().map(key=>({key})),truncated:false};},
  };
  function request(path,{user,session,method='GET',payload,origin}={}){
    const headers={};
    if(user)headers['oai-authenticated-user-id']=user;
    if(session)headers['x-studio-session']=session;
    if(origin)headers.origin=origin;
    if(payload!==undefined)headers['content-type']='application/json';
    const input=new Request('https://studio.test'+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)});
    return worker.fetch(input,{STUDIO:bucket},{waitUntil:job=>background.push(job)});
  }
  return {request,bucket,objects,background};
}
const rpc=(request,method,params,user)=>request('/mcp',{
  method:'POST',user,payload:{jsonrpc:'2.0',id:1,method,params},
}).then(response=>response.json());
const call=(request,name,args={},user='a')=>rpc(request,'tools/call',{name,arguments:args},user).then(result=>result.result);
const create=(request,user='a')=>request('/api/session',{user,method:'POST'}).then(response=>response.json());
const operate=(request,session,title,revision=0)=>request('/api/operations',{
  method:'POST',user:'a',session,payload:{baseRevision:revision,operations:[{type:'rename_scene',title}]},
});

test('Sites serves v0.7 browser modules and the embedded editor with 17 MCP tools',async()=>{
  const {request}=fixture();
  assert.deepEqual((await rpc(request,'server/discover')).result.supportedVersions,['2026-07-28']);
  const tools=(await rpc(request,'tools/list')).result.tools;
  assert.equal(tools.length,17);
  assert.ok(tools.find(tool=>tool.name==='get_world_state').inputSchema.required.includes('sessionId'));
  assert.ok(!tools.some(tool=>tool.name==='save_scene'));
  const uri=tools.find(tool=>tool.name==='open_studio')._meta.ui.resourceUri;
  for(const resourceUri of [uri,'ui://osce-sandbox-studio/interactive.html']){
    const resource=(await rpc(request,'resources/read',{uri:resourceUri})).result.contents[0];
    assert.equal(resource.mimeType,'text/html;profile=mcp-app');
    assert.match(resource.text,/function installDirectTouch/);
    assert.match(resource.text,/function solveTwoBone3D/);
    assert.match(resource.text,/appInfo:/);
    assert.doesNotThrow(()=>new Script(resource.text.match(/<script>([\s\S]*?)<\/script>/)[1]));
  }
  for(const script of ['touch-pose','ik3d','placement']){
    const response=await request('/'+script+'.js');
    assert.equal(response.status,200);
    assert.match(response.headers.get('content-type'),/javascript/);
  }
  assert.equal((await rpc(request,'tools/call',{name:'open_studio'})).result.isError,true);
  assert.equal((await request('/api/session',{method:'POST'})).status,401);
  assert.match(await (await request('/')).text(),/Masuk dengan ChatGPT/);
});

test('tablet and MCP share only the same active session and preserve archived v0.4 data',async()=>{
  const {request,objects}=fixture();
  const first=await create(request);
  const fresh=(await call(request,'open_studio')).structuredContent;
  assert.equal(fresh.studioVersion,'0.7.0');
  assert.notEqual(first.sessionId,fresh.sessionId);
  assert.equal(first.scene.revision,0);
  assert.equal(fresh.scene.revision,0);
  const joined=(await call(request,'open_studio',{sessionId:first.sessionId})).structuredContent;
  assert.equal(joined.sessionId,first.sessionId);
  const asset={id:'test-probe',name:'Test probe',parts:[{shape:'sphere',position:[0,0,0],size:[.1,.1,.1],color:'#ebe8ec'}]};
  assert.equal((await call(request,'create_asset',{...asset,sessionId:first.sessionId})).isError,false);
  const fromWeb=await (await request('/api/state',{user:'a',session:first.sessionId})).json();
  assert.ok(fromWeb.assets.some(item=>item.id===asset.id));
  assert.equal(fromWeb.scene.revision,1);
  assert.ok(!(await (await request('/api/state',{user:'a',session:fresh.sessionId})).json()).assets.some(item=>item.id===asset.id));
  assert.equal((await request('/api/state',{user:'b',session:first.sessionId})).status,410);
  assert.equal((await call(request,'get_world_state')).isError,true);
  assert.equal((await request('/api/undo',{method:'POST',user:'a',session:first.sessionId})).status,200);
  const afterUndo=(await call(request,'get_world_state',{sessionId:first.sessionId})).structuredContent;
  assert.ok(!afterUndo.assets.some(item=>item.id===asset.id));
  assert.equal(afterUndo.scene.revision,2);
  assert.equal((await request('/api/save',{method:'POST',user:'a',session:first.sessionId})).status,410);
  assert.equal((await request('/api/state',{user:'a',session:first.sessionId,origin:'https://other.test'})).status,403);
  assert.equal((await request('/api/session',{user:'a',session:first.sessionId,method:'DELETE'})).status,200);
  assert.equal((await call(request,'get_world_state',{sessionId:first.sessionId})).isError,true);
  assert.equal(objects.get('projects/a.json').body,'archived scene');
});

test('concurrent edits keep one revision and previews leave it untouched',async()=>{
  const {request}=fixture();
  const {sessionId}=await create(request);
  const writes=await Promise.all([operate(request,sessionId,'First'),operate(request,sessionId,'Second')]);
  assert.deepEqual(writes.map(reply=>reply.status).sort(),[200,409]);
  const preview=(await call(request,'preview_scene_operations',{sessionId,baseRevision:1,operations:[{type:'rename_scene',title:'Unsaved preview'}]})).structuredContent;
  assert.equal(preview.scene.title,'Unsaved preview');
  const state=await (await request('/api/state',{user:'a',session:sessionId})).json();
  assert.notEqual(state.scene.title,preview.scene.title);
  assert.equal(state.scene.revision,1);
});

test('hosted event stream reports an MCP update to the matching tablet session',async()=>{
  const {request}=fixture();
  const {sessionId}=await create(request);
  const stream=await request('/api/events?since=0',{user:'a',session:sessionId});
  assert.match(stream.headers.get('content-type'),/text\/event-stream/);
  const reader=stream.body.getReader();
  try{
    assert.match(new TextDecoder().decode((await reader.read()).value),/connected/);
    await call(request,'apply_scene_operations',{sessionId,baseRevision:0,operations:[{type:'rename_scene',title:'From MCP'}]});
    assert.match(new TextDecoder().decode((await reader.read()).value),/scene_updated[\s\S]*"revision":1/);
  }finally{await reader.cancel();}
});

test('expired hosted sessions cannot be read and cleanup never deletes archived projects',async()=>{
  const {bucket,objects}=fixture();
  const sessions=new SiteSessions(bucket,'a');
  const expires=Date.now()-100;
  const uuid='30b94468-036e-4f9f-9ad9-4566ecabc111';
  const expired='temporary/v06/'+expires+'/a/'+uuid+'.json';
  objects.set(expired,{etag:'expired',body:'{}'});
  await assert.rejects(sessions.open(expires+'.'+uuid),{code:'SESSION_EXPIRED'});
  await sessions.create();
  await sessions.sweep();
  assert.ok(!objects.has(expired));
  assert.ok(objects.has('projects/a.json'));
  assert.equal(objects.size,2);
});
