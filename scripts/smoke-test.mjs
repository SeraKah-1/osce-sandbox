// Test a locally or publicly deployed studio. Example:
//   STUDIO_URL=https://osce.example.com API_TOKEN=... npm run smoke
import {WIDGET_URI} from '../server/widget.js';
const base=(process.env.STUDIO_URL||'http://127.0.0.1:4173').replace(/\/$/,'');
const token=process.env.API_TOKEN||'';
const headers={'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})};
const fail=message=>{console.error('FAIL:',message);process.exitCode=1;};
async function run(){
  const health=await fetch(base+'/health');if(!health.ok)throw Error('Health failed '+health.status);
  const scene=await fetch(base+'/api/state',{headers});if(!scene.ok)throw Error('State failed '+scene.status);const data=await scene.json();
  if(data.scene.entities.length<2)throw Error('Expected two characters');
  const post=async(method,params={})=>{const r=await fetch(base+'/mcp',{method:'POST',headers,body:JSON.stringify({jsonrpc:'2.0',id:1,method,params})});if(!r.ok)throw Error(method+' HTTP '+r.status);const j=await r.json();if(j.error)throw Error(JSON.stringify(j.error));return j.result;};
  const init=await post('initialize',{protocolVersion:'2025-11-25',capabilities:{},clientInfo:{name:'studio-smoke',version:'1.0'}});
  const tools=(await post('tools/list')).tools;
  const resources=(await post('resources/list')).resources;
  const ui=(await post('resources/read',{uri:WIDGET_URI})).contents[0];
  const open=(await post('tools/call',{name:'open_studio',arguments:{}})).structuredContent;
  if(!tools.some(x=>x.name==='preview_scene_operations'))throw Error('preview tool missing');
  if(!tools.some(x=>x.name==='open_studio'))throw Error('open_studio tool missing');
  if(!resources.some(x=>x.mimeType==='text/html;profile=mcp-app'))throw Error('MCP App resource missing');
  if(!ui.text.includes('canvas id="scene3d"'))throw Error('Embedded UI missing 3D editor');
  if(open.scene.revision!==data.scene.revision)throw Error('MCP scene differs from API scene');
  const app=await fetch(base+'/widget');if(!app.ok)throw Error('Widget preview endpoint broken');
  console.log(JSON.stringify({ok:true,revision:data.scene.revision,tools:tools.length,resources:resources.length,server:init.serverInfo.name,uiBytes:ui.text.length},null,2));
}
await run().catch(e=>fail(e.message));
