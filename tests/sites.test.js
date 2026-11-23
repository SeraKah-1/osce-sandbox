import test from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath,['scripts/build-sites.mjs']);
const {default:worker}=await import('../dist/server/index.js');
const {Studio}=await import('../dist/server/studio.js');

function fixture(seed) {
  const objects=new Map(seed ? [['projects/a.json',{etag:'previous',body:JSON.stringify(seed)}]] : []);
  let version=0;
  const env={STUDIO:{
    async get(key){
      const object=objects.get(key);
      return object && {etag:object.etag,json:async()=>JSON.parse(object.body)};
    },
    async put(key,body,{onlyIf}){
      const existing=objects.get(key);
      if (onlyIf instanceof Headers ? existing : existing?.etag!==onlyIf.etagMatches) return null;
      const object={etag:String(++version),body};
      objects.set(key,object);
      return object;
    },
  }};
  return (path,{user,method='GET',payload,origin}={})=>{
    const headers={};
    if(user) headers['oai-authenticated-user-id']=user;
    if(origin) headers.origin=origin;
    if(payload!==undefined) headers['content-type']='application/json';
    return worker.fetch(new Request('https://studio.test'+path,{method,headers,body:payload===undefined?undefined:JSON.stringify(payload)}),env);
  };
}
const rpc=(request,method,params,user)=>request('/mcp',{
  method:'POST',user,payload:{jsonrpc:'2.0',id:1,method,params},
}).then(response=>response.json());
const operate=(request,user,title,revision=0)=>request('/api/operations',{
  method:'POST',user,payload:{baseRevision:revision,operations:[{type:'rename_scene',title}]},
});

test('Sites discovers all 18 tools and provides the real MCP Apps resource',async()=>{
  const request=fixture();
  assert.deepEqual((await rpc(request,'server/discover')).result.supportedVersions,['2026-07-28']);
  const tools=(await rpc(request,'tools/list')).result.tools;
  assert.equal(tools.length,18);
  const uri=tools.find(tool=>tool.name==='open_studio')._meta.ui.resourceUri;
  const resource=(await rpc(request,'resources/read',{uri})).result.contents[0];
  assert.equal(resource.mimeType,'text/html;profile=mcp-app');
  assert.match(resource.text,/ui\/initialize/);
  assert.match(resource.text,/OSCE Playground/);
  assert.match(resource.text,/appInfo:/);
  assert.match(resource.text,/function installDirectTouch/);
  const renderer=await request('/touch-pose.js');
  assert.equal(renderer.status,200);
  assert.match(renderer.headers.get('content-type'),/javascript/);
  assert.doesNotThrow(()=>new Script(resource.text.match(/<script>([\s\S]*?)<\/script>/)[1]));
  assert.match(resource.text,/createRenderer/);
  assert.equal((await rpc(request,'tools/call',{name:'open_studio'})).result.isError,true);
  assert.match(await (await request('/')).text(),/Masuk dengan ChatGPT/);
});

test('Sites isolates projects and shares durable writes and undo between browser and MCP',async()=>{
  const request=fixture();
  const asset={id:'test-probe',name:'Test probe',parts:[{shape:'sphere',position:[0,0,0],size:[.1,.1,.1],color:'#ebe8ec'}]};
  assert.equal((await rpc(request,'tools/call',{name:'create_asset',arguments:asset},'a')).result.isError,false);
  const fromWeb=await (await request('/api/state',{user:'a'})).json();
  assert.ok(fromWeb.assets.some(item=>item.id===asset.id));
  assert.equal(fromWeb.scene.revision,1);
  assert.ok(!(await (await request('/api/state',{user:'b'})).json()).assets.some(item=>item.id===asset.id));
  assert.equal((await request('/api/state')).status,401);
  assert.equal((await request('/api/undo',{method:'POST',user:'a'})).status,200);
  const fromMcp=(await rpc(request,'tools/call',{name:'get_world_state'},'a')).result.structuredContent;
  assert.ok(!fromMcp.assets.some(item=>item.id===asset.id));
  assert.equal(fromMcp.scene.revision,2);
  assert.equal((await rpc(request,'tools/call',{name:'save_scene'},'a')).result.structuredContent.stored,true);
  assert.equal((await request('/api/state',{user:'a',origin:'https://other.test'})).status,403);
});

test('Sites rejects concurrent writes based on the same revision',async()=>{
  const request=fixture();
  for (const revision of [0,1]) {
    const writes=await Promise.all([
      operate(request,'a','First edit '+revision,revision),
      operate(request,'a','Second edit '+revision,revision),
    ]);
    assert.deepEqual(writes.map(reply=>reply.status).sort(),[200,409]);
    assert.equal((await (await request('/api/state',{user:'a'})).json()).scene.revision,revision+1);
  }
});

test('preview never writes and the older resource URI serves the new editor', async()=>{
  const request=fixture();
  assert.equal((await operate(request,'a','Saved project')).status,200);
  const preview=(await rpc(request,'tools/call',{name:'preview_scene_operations',arguments:{baseRevision:1,operations:[{type:'rename_scene',title:'Unsaved preview'}]}},'a')).result;
  assert.equal(preview.structuredContent.scene.title,'Unsaved preview');
  const state=await (await request('/api/state',{user:'a'})).json();
  assert.equal(state.scene.title,'Saved project');
  assert.equal(state.scene.revision,1);
  const legacy=(await rpc(request,'resources/read',{uri:'ui://osce-sandbox-studio/interactive.html'})).result;
  assert.match(legacy.contents[0].text,/OSCE Playground/);
});

test('v0.2 projects keep assets and history while upgrading the built-in instrument grip',async()=>{
  const saved=new Studio().storedState();
  const grip=saved.behaviors.find(behavior=>behavior.id==='attach-basic');
  delete grip.transitions.find(transition=>transition.action==='hold').effects;
  saved.scene.title='Previous project';
  saved.scene.revision=8;
  saved.undoStack.push(structuredClone({scene:saved.scene,assets:saved.assets,behaviors:saved.behaviors}));
  const request=fixture(saved);
  const fromPlugin=(await rpc(request,'tools/call',{name:'open_studio'},'a')).result.structuredContent;
  const fromBrowser=await (await request('/api/state',{user:'a'})).json();
  assert.equal(fromPlugin.studioVersion,'0.4.0');
  assert.equal(fromBrowser.scene.title,'Previous project');
  assert.deepEqual(fromPlugin.scene,fromBrowser.scene);
  assert.deepEqual(fromBrowser.assets,saved.assets);
  assert.equal(fromPlugin.behaviors[0].transitions[0].effects[0].anchor,'rightHand');
  assert.equal((await request('/api/undo',{method:'POST',user:'a'})).status,200);
  const afterUndo=await (await request('/api/state',{user:'a'})).json();
  assert.equal(afterUndo.scene.revision,9);
  assert.equal(afterUndo.behaviors[0].transitions[0].effects[0].anchor,'rightHand');
});
