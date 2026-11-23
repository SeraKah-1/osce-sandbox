import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SceneError} from './core.js';
import {rpc} from './mcp.js';
import {widgetHTML} from './widget.js';
import {SessionWorlds} from './sessions.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const WEB=path.join(root,'web');
const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||4173);
const API_TOKEN=process.env.API_TOKEN||'';
if(!['127.0.0.1','localhost','::1'].includes(HOST)&&!API_TOKEN)throw Error('Public bind requires API_TOKEN and an HTTPS reverse proxy');
const clients=new Map();
const worlds=new SessionWorlds({onUpdate:(id,event)=>{
  const message=`event: scene_updated\ndata: ${JSON.stringify(event)}\n\n`;
  for(const res of clients.get(id)||[]){try{res.write(message)}catch{clients.get(id)?.delete(res)}}
}});
let chatSessionId=null;
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.webmanifest':'application/manifest+json'};
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(value));}
async function bodyJson(req){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1_500_000)throw new SceneError('Body terlalu besar','TOO_LARGE',413);chunks.push(c)}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw new SceneError('JSON tidak valid')}}
function authorized(req){return !API_TOKEN||req.headers.authorization===`Bearer ${API_TOKEN}`;}
function studioForRequest(req){return worlds.get(req.headers['x-studio-session']);}
function resolveMcp(id,createForOpen){
  if(createForOpen&&!id)return worlds.get(worlds.create().sessionId);
  if(id)return worlds.get(id);
  if(!chatSessionId){chatSessionId=worlds.create().sessionId;}
  try{return worlds.get(chatSessionId)}catch{chatSessionId=worlds.create().sessionId;return worlds.get(chatSessionId)}
}
setInterval(()=>worlds.sweep(),60_000).unref();
const server=http.createServer(async(req,res)=>{
 try{
  const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
  if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host&&url.pathname!=='/health')throw new SceneError('Cross-origin request forbidden','FORBIDDEN',403);
  if(req.method==='OPTIONS'){res.writeHead(204,{'Allow':'GET,POST,DELETE,PATCH,OPTIONS','Access-Control-Allow-Headers':'Content-Type,Authorization,X-Studio-Session,MCP-Protocol-Version,MCP-Session-Id,Accept'});res.end();return;}
  if(req.method==='GET'&&url.pathname==='/widget'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'self'"});res.end(widgetHTML());return;}
  if(url.pathname==='/health'){json(res,200,{ok:true,server:'osce-playground',version:'0.6.0',persistence:false,sessionCount:worlds.sessions.size});return;}
  if(url.pathname==='/mcp'){
    if(!authorized(req)){json(res,401,{error:'Bearer token required'});return;}
    if(req.method!=='POST'){json(res,405,{error:'POST only'});return;}
    const result=rpc(resolveMcp,await bodyJson(req));if(result===null){res.writeHead(202);res.end();return;}
    json(res,200,result,{'MCP-Protocol-Version':'2025-11-25'});return;
  }
  if(url.pathname.startsWith('/api/')){
    if(!authorized(req)){json(res,401,{error:'Token server diperlukan. Buka pengaturan koneksi.'});return;}
    if(req.method==='POST'&&url.pathname==='/api/session'){json(res,201,worlds.create());return;}
    const studio=studioForRequest(req);
    if(req.method==='DELETE'&&url.pathname==='/api/session'){
      worlds.close(studio.sessionId);for(const client of clients.get(studio.sessionId)||[])try{client.end()}catch{}clients.delete(studio.sessionId);
      json(res,200,{ok:true,reset:true});return;
    }
    if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,{sessionId:studio.sessionId,...studio.snapshot()});return;}
    if(req.method==='GET'&&url.pathname==='/api/log'){json(res,200,studio.log);return;}
    if(req.method==='GET'&&url.pathname==='/api/events'){
      res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write(': connected\n\n');let set=clients.get(studio.sessionId);if(!set){set=new Set();clients.set(studio.sessionId,set);}set.add(res);
      const ping=setInterval(()=>{try{worlds.get(studio.sessionId);res.write(': ping\n\n')}catch{}},20_000);
      req.on('close',()=>{clearInterval(ping);set.delete(res);if(!set.size)clients.delete(studio.sessionId)});return;
    }
    if(req.method==='POST'&&url.pathname==='/api/operations'){const p=await bodyJson(req);json(res,200,studio.apply(p.operations,p.baseRevision));return;}
    if(req.method==='POST'&&url.pathname==='/api/preview'){const p=await bodyJson(req);json(res,200,studio.preview(p.operations,p.baseRevision));return;}
    if(req.method==='POST'&&url.pathname==='/api/assets'){json(res,201,studio.createAsset(await bodyJson(req)));return;}
    if(req.method==='PATCH'&&url.pathname.startsWith('/api/assets/')){json(res,200,studio.updateAsset(url.pathname.slice(12),await bodyJson(req)));return;}
    if(req.method==='POST'&&url.pathname==='/api/validate-asset'){json(res,200,studio.validateAssetDraft(await bodyJson(req)));return;}
    if(req.method==='POST'&&url.pathname==='/api/validate-behavior'){json(res,200,studio.validateBehaviorDraft(await bodyJson(req)));return;}
    if(req.method==='POST'&&url.pathname==='/api/behaviors'){json(res,201,studio.createBehavior(await bodyJson(req)));return;}
    if(req.method==='PATCH'&&url.pathname.startsWith('/api/behaviors/')){json(res,200,studio.updateBehavior(url.pathname.slice(15),await bodyJson(req)));return;}
    if(req.method==='POST'&&url.pathname==='/api/behavior-test'){const p=await bodyJson(req);json(res,200,studio.validateBehaviorTest(p.behaviorId,p.actions));return;}
    if(req.method==='POST'&&url.pathname==='/api/undo'){json(res,200,studio.historyMove('undo'));return;}
    if(req.method==='POST'&&url.pathname==='/api/redo'){json(res,200,studio.historyMove('redo'));return;}
    if(req.method==='POST'&&url.pathname==='/api/restore'){const p=await bodyJson(req);json(res,200,studio.restore(p.snapshot,p.baseRevision));return;}
    if(req.method==='POST'&&url.pathname==='/api/reset'){const p=await bodyJson(req);if(p.confirmed!==true)throw new SceneError('Konfirmasi reset diperlukan');json(res,200,studio.reset());return;}
    if(req.method==='POST'&&url.pathname==='/api/save'){json(res,410,{error:'Sesi sementara: penyimpanan sengaja dinonaktifkan.'});return;}
    json(res,404,{error:'Endpoint tidak tersedia'});return;
  }
  if(!['GET','HEAD'].includes(req.method)){json(res,405,{error:'Method not allowed'});return;}
  let pathname=decodeURIComponent(url.pathname);if(pathname==='/')pathname='/index.html';
  const file=path.resolve(WEB,'.'+pathname);if(!file.startsWith(WEB+path.sep)){json(res,403,{error:'Forbidden'});return;}
  let st;try{st=fs.statSync(file)}catch{json(res,404,{error:'File not found'});return;}if(!st.isFile()){json(res,404,{error:'Not a file'});return;}
  res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':pathname==='/index.html'?'no-cache':'max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});
  if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
 }catch(e){json(res,e.status||400,{error:e.message,code:e.code||'INTERNAL_ERROR'});}
});
server.listen(PORT,HOST,()=>console.log(`OSCE Playground v0.6 at http://${HOST}:${PORT} · sessions RAM only · MCP /mcp`));
process.on('SIGTERM',()=>server.close());
