import {readFileSync} from 'node:fs';
// Health + new temporary session + MCP controls the SAME session + deletion.
// STUDIO_URL=https://... API_TOKEN=... npm run smoke
import {WIDGET_URI} from '../server/widget.js';
const base=(process.env.STUDIO_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const auth=process.env.API_TOKEN||'';
const headers={'Content-Type':'application/json',...(auth?{Authorization:'Bearer '+auth}:{})};
const api=async(path,method='GET',body,extra={})=>{
 const r=await fetch(base+path,{method,headers:{...headers,...extra},body:body===undefined?undefined:JSON.stringify(body)});
 const out=await r.json();if(!r.ok)throw Error(`${path}: ${r.status} ${out.error||''}`);return out;
};
const mcp=async(method,params={})=>{
 const v=await api('/mcp','POST',{jsonrpc:'2.0',id:23,method,params});
 if(v.error||v.result?.isError)throw Error(JSON.stringify(v.error||v.result));return v.result;
};
const health=await api('/health');if(health.sessionPersistence!==false||health.environmentPersistence!==true||health.version!=='0.9.0')throw Error(`Wrong server at ${base}: expected v0.9 with transient sessions + durable environments; got ${JSON.stringify(health)}.`);
const start=await api('/api/session','POST',{});const id=start.sessionId;let envId=null;
try{
 const list=(await mcp('tools/list')).tools;
 const resource=(await mcp('resources/read',{uri:WIDGET_URI})).contents[0];
 if(!resource.text.includes('id="scene3d"'))throw Error('MCP 3D view missing');
 if(list.some(x=>x.name==='save_scene'))throw Error('Deprecated save_scene must be unavailable');
 if(!list.some(x=>x.name==='create_environment')||!list.some(x=>x.name==='delete_environment'))throw Error('Persistent MCP tools missing');
 const world=(await mcp('tools/call',{name:'get_world_state',arguments:{sessionId:id}})).structuredContent;
 if(world.sessionId!==id||world.scene.revision!==0)throw Error('MCP session mismatch');
 const mutation=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:0,operations:[{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:45}]}})).structuredContent;
 if(mutation.revision!==1)throw Error('MCP write not applied');
 const latest=await api('/api/state','GET',undefined,{'X-Studio-Session':id});
 if(latest.scene.entities.find(e=>e.id==='patient').pose.rightElbow.flexion!==45)throw Error('Tablet state not updated');
 // A character can be placed on a support and follows furniture moved by ChatGPT.
 const lying=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:1,operations:[{type:'place_character',entityId:'patient',supportId:'bed-1',affordanceId:'lie'}]}})).structuredContent;
 if(lying.revision!==2)throw Error('Bed placement failed');
 const moved=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:2,operations:[{type:'move_entity',entityId:'bed-1',position:[3,0,-2]}]}})).structuredContent;
 if(moved.revision!==3)throw Error('Furniture move failed');
 const active=await api('/api/state','GET',undefined,{'X-Studio-Session':id});
 const char=active.scene.entities.find(e=>e.id==='patient');
 if(char.supportedBy?.entityId!=='bed-1'||Math.abs(char.position[0]-3)>1e-5)throw Error('Patient must follow the moved bed');

 // The same MCP session can create an articulated asset and operate its moving parts.
 const blueprint=JSON.parse(readFileSync(new URL('../examples/articulated-demo.json',import.meta.url),'utf8'));
 const created=(await mcp('tools/call',{name:'create_asset',arguments:{sessionId:id,...blueprint}})).structuredContent;
 if(!created.ok)throw Error('MCP create_asset failed');
 let rev=created.revision;
 const spawned=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:rev,operations:[{type:'spawn_asset',id:'smoke-detail',assetId:blueprint.id,position:[0,0,1]}]}})).structuredContent;
 rev=spawned.revision;
 const changed=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:rev,operations:[{type:'set_mechanism',entityId:'smoke-detail',mechanismId:'lever-hinge',value:45}]}})).structuredContent;
 const finalState=await api('/api/state','GET',undefined,{'X-Studio-Session':id});
 if(finalState.scene.entities.find(e=>e.id==='smoke-detail')?.controls?.['lever-hinge']!==45)throw Error('MCP micro action not reflected in tablet state');
 // Create a named GPT environment, edit and autosave it, then prove that manual
 // tablet gestures do not overwrite the saved blueprint.
 const env=(await mcp('tools/call',{name:'create_environment',arguments:{name:'SMOKE TEST environment',sessionId:id}})).structuredContent;
 envId=env.environment.id;
 const changedWorld=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:env.scene.revision,operations:[{type:'spawn_asset',id:'smoke-chair',assetId:'chair',position:[2,0,0]}]}})).structuredContent;
 if(!changedWorld.autoSaved)throw Error('MCP edit did not auto-save');
 let live=await api('/api/state','GET',undefined,{'X-Studio-Session':id});
 await api('/api/operations','POST',{baseRevision:live.scene.revision,operations:[{type:'move_entity',entityId:'patient',position:[4,0,0]}]},{'X-Studio-Session':id});
 const persisted=(await mcp('tools/call',{name:'get_environment',arguments:{environmentId:envId}})).structuredContent;
 if(!persisted.snapshot.scene.entities.some(e=>e.id==='smoke-chair'))throw Error('GPT-created chair not persisted');
 if(persisted.snapshot.scene.entities.find(e=>e.id==='patient').position[0]===4)throw Error('Manual pose incorrectly persisted');
 console.log(JSON.stringify({ok:true,transientGestures:true,persistentMcpEnvironments:true,tools:list.length,resource:WIDGET_URI,sessionId:id,environmentId:envId,revision:changedWorld.revision,articulatedMechanism:45},null,2));
}finally{if(envId){await mcp('tools/call',{name:'delete_environment',arguments:{environmentId:envId,confirmed:true}}).catch(e=>console.error('WARNING: smoke environment cleanup failed:',e.message));}await api('/api/session','DELETE',undefined,{'X-Studio-Session':id});}
