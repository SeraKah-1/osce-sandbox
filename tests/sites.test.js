import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';

execFileSync(process.execPath,['scripts/build-sites.mjs']);
const {default:worker}=await import('../dist/server/index.js');

function fixture() {
  const objects=new Map();
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

test('Sites discovers all 17 tools and provides the real MCP Apps resource',async()=>{
  const request=fixture();
  assert.deepEqual((await rpc(request,'server/discover')).result.supportedVersions,['2026-07-28']);
  const tools=(await rpc(request,'tools/list')).result.tools;
  assert.equal(tools.length,17);
  const uri=tools.find(tool=>tool.name==='open_studio')._meta.ui.resourceUri;
  const resource=(await rpc(request,'resources/read',{uri})).result.contents[0];
  assert.equal(resource.mimeType,'text/html;profile=mcp-app');
  assert.match(resource.text,/ui\/initialize/);
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
