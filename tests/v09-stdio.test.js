import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root=path.resolve(import.meta.dirname,'..');
function start(directory){
  const child=spawn(process.execPath,['server/stdio.js'],{cwd:root,env:{...process.env,ENVIRONMENT_DATA_DIR:directory},stdio:['pipe','pipe','pipe']});
  let data='',id=0;
  const pending=new Map();
  child.stdout.setEncoding('utf8');child.stdout.on('data',chunk=>{
    data+=chunk;const lines=data.split('\n');data=lines.pop();
    for(const line of lines){if(!line)continue;const x=JSON.parse(line);const p=pending.get(x.id);if(p){pending.delete(x.id);p.resolve(x);}}
  });
  child.on('exit',(code)=>{for(const p of pending.values())p.reject(Error('stdio exited '+code));pending.clear();});
  return {
    request(method,params={}){
      const key=++id;
      return Promise.race([new Promise((resolve,reject)=>{pending.set(key,{resolve,reject});child.stdin.write(JSON.stringify({jsonrpc:'2.0',id:key,method,params})+'\n');}),new Promise((_,reject)=>setTimeout(()=>reject(Error('stdio timeout')),3500))]);
    },
    close(){child.stdin.end();child.kill();}
  };
}

test('stdio MCP can create, persist, reload and delete environments across adapter restart',async()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'osce-stdio-'));
  let mcp=start(directory);
  try{
    const init=await mcp.request('initialize');
    assert.equal(init.result.serverInfo.version,'0.9.0');
    const tools=await mcp.request('tools/list');
    assert.ok(tools.result.tools.some(t=>t.name==='delete_environment'));
    const created=await mcp.request('tools/call',{name:'create_environment',arguments:{name:'Uji stdio'}});
    assert.equal(created.result.isError,false);
    const env=created.result.structuredContent.environment;
    assert.match(env.id,/^env-/);
    mcp.close();
    mcp=start(directory);
    const listed=await mcp.request('tools/call',{name:'list_environments',arguments:{}});
    assert.equal(listed.result.structuredContent.environments.length,1);
    const scene=await mcp.request('tools/call',{name:'load_environment',arguments:{environmentId:env.id}});
    const sid=scene.result.structuredContent.sessionId;
    assert.ok(sid);
    const deleted=await mcp.request('tools/call',{name:'delete_environment',arguments:{environmentId:env.id,confirmed:true}});
    assert.equal(deleted.result.structuredContent.deleted,true);
    const empty=await mcp.request('tools/call',{name:'list_environments',arguments:{}});
    assert.deepEqual(empty.result.structuredContent.environments,[]);
  }finally{mcp.close();fs.rmSync(directory,{recursive:true,force:true});}
});
