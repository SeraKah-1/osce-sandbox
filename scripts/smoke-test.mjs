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
const health=await api('/health');if(health.persistence!==false||health.version!=='0.6.0')throw Error(`Wrong server at ${base}: expected v0.6 RAM-only sessions; got ${JSON.stringify(health)}. Set STUDIO_URL to the active v0.6 server.`);
const start=await api('/api/session','POST',{});const id=start.sessionId;
try{
 const list=(await mcp('tools/list')).tools;
 const resource=(await mcp('resources/read',{uri:WIDGET_URI})).contents[0];
 if(!resource.text.includes('id="scene3d"'))throw Error('MCP 3D view missing');
 if(list.some(x=>x.name==='save_scene'))throw Error('Deprecated save tool must be unavailable');
 const world=(await mcp('tools/call',{name:'get_world_state',arguments:{sessionId:id}})).structuredContent;
 if(world.sessionId!==id||world.scene.revision!==0)throw Error('MCP session mismatch');
 const mutation=(await mcp('tools/call',{name:'apply_scene_operations',arguments:{sessionId:id,baseRevision:0,operations:[{type:'set_joint',entityId:'patient',joint:'rightElbow',axis:'flexion',angle:45}]}})).structuredContent;
 if(mutation.revision!==1)throw Error('MCP write not applied');
 const latest=await api('/api/state','GET',undefined,{'X-Studio-Session':id});
 if(latest.scene.entities.find(e=>e.id==='patient').pose.rightElbow.flexion!==45)throw Error('Tablet state not updated');
 console.log(JSON.stringify({ok:true,ephemeral:true,tools:list.length,resource:WIDGET_URI,sessionId:id,revision:latest.scene.revision},null,2));
}finally{await api('/api/session','DELETE',undefined,{'X-Studio-Session':id});}
