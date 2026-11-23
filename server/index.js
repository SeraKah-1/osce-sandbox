import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {makeStudio,SceneError} from './core.js';
import {rpc} from './mcp.js';
import {widgetHTML} from './widget.js';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const WEB=path.join(root,'web');
const DATA=process.env.STUDIO_DATA||path.join(root,'data','studio.json');
const HOST=process.env.HOST||'127.0.0.1';
const PORT=Number(process.env.PORT||4173);
const API_TOKEN=process.env.API_TOKEN||'';
if(!['127.0.0.1','localhost','::1'].includes(HOST) && !API_TOKEN)throw Error('Binding publik membutuhkan API_TOKEN. Gunakan reverse proxy HTTPS dan autentikasi tambahan untuk produksi.');
const studio=makeStudio(DATA);
const clients=new Set();
studio.listeners.add(event=>{
  const message=`event: scene_updated\ndata: ${JSON.stringify(event)}\n\n`;
  for(const client of clients){try{client.write(message)}catch{clients.delete(client)}}
});
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.svg':'image/svg+xml','.ico':'image/x-icon','.webmanifest':'application/manifest+json'};
function json(res,status,value,headers={}){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',...headers});res.end(JSON.stringify(value));}
async function bodyJson(req){const chunks=[];let size=0;for await(const c of req){size+=c.length;if(size>1_500_000)throw new SceneError('Body melebihi 1.5MB','TOO_LARGE',413);chunks.push(c);}try{return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}')}catch{throw new SceneError('JSON tidak valid');}}
function authorized(req){if(!API_TOKEN)return true;const auth=req.headers.authorization;return auth===`Bearer ${API_TOKEN}`;}
const server=http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url||'/',`http://${req.headers.host||'localhost'}`);
    if(req.headers.origin&&new URL(req.headers.origin).host!==req.headers.host&&url.pathname!=='/health')throw new SceneError('Cross-origin browser request forbidden','FORBIDDEN',403);
    if(req.method==='OPTIONS'){res.writeHead(204,{'Allow':'GET, POST, PATCH, OPTIONS','Access-Control-Allow-Origin':'null','Access-Control-Allow-Headers':'Content-Type, Authorization, MCP-Protocol-Version, MCP-Session-Id, Accept'});res.end();return;}
    if(req.method==='GET'&&url.pathname==='/widget'){res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; object-src 'none'; frame-ancestors 'self'"});res.end(widgetHTML());return;}
    if(url.pathname==='/health'){json(res,200,{ok:true,revision:studio.scene.revision,server:'osce-sandbox-studio'});return;}
    if(url.pathname==='/mcp'){
      if(!authorized(req)){json(res,401,{error:'Bearer token required'});return;}
      if(req.method==='GET'){res.writeHead(405,{'Allow':'POST'});res.end();return;}
      if(req.method!=='POST'){json(res,405,{error:'POST only'});return;}
      // Stateless Streamable HTTP, JSON response mode.
      const result=rpc(studio,await bodyJson(req));
      if(result===null){res.writeHead(202);res.end();return;}
      json(res,200,result,{'MCP-Protocol-Version':'2025-11-25'});return;
    }
    if(url.pathname.startsWith('/api/')){
      if(!authorized(req)){json(res,401,{error:'Token server diperlukan. Atur kunci pada panel Koneksi.'});return;}
      if(req.method==='GET'&&url.pathname==='/api/state'){json(res,200,studio.snapshot());return;}
      if(req.method==='GET'&&url.pathname==='/api/log'){json(res,200,studio.log);return;}
      if(req.method==='GET'&&url.pathname==='/api/events'){
        res.writeHead(200,{'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});res.write(': connected\n\n');clients.add(res);req.on('close',()=>clients.delete(res));return;
      }
      if(req.method==='POST'&&url.pathname==='/api/operations'){const payload=await bodyJson(req);json(res,200,studio.apply(payload.operations,payload.baseRevision));return;}
      if(req.method==='POST'&&url.pathname==='/api/preview'){const payload=await bodyJson(req);json(res,200,studio.preview(payload.operations,payload.baseRevision));return;}
      if(req.method==='POST'&&url.pathname==='/api/assets'){json(res,201,studio.createAsset(await bodyJson(req)));return;}
      if(req.method==='PATCH'&&url.pathname.startsWith('/api/assets/')){const id=url.pathname.slice('/api/assets/'.length);json(res,200,studio.updateAsset(id,await bodyJson(req)));return;}
      if(req.method==='POST'&&url.pathname==='/api/validate-asset'){json(res,200,studio.validateAssetDraft(await bodyJson(req)));return;}
      if(req.method==='POST'&&url.pathname==='/api/validate-behavior'){json(res,200,studio.validateBehaviorDraft(await bodyJson(req)));return;}
      if(req.method==='POST'&&url.pathname==='/api/behaviors'){json(res,201,studio.createBehavior(await bodyJson(req)));return;}
      if(req.method==='PATCH'&&url.pathname.startsWith('/api/behaviors/')){const id=url.pathname.slice('/api/behaviors/'.length);json(res,200,studio.updateBehavior(id,await bodyJson(req)));return;}
      if(req.method==='POST'&&url.pathname==='/api/behavior-test'){const p=await bodyJson(req);json(res,200,studio.validateBehaviorTest(p.behaviorId,p.actions));return;}
      if(req.method==='POST'&&url.pathname==='/api/save'){json(res,200,studio.save());return;}
      if(req.method==='POST'&&url.pathname==='/api/undo'){json(res,200,studio.historyMove('undo'));return;}
      if(req.method==='POST'&&url.pathname==='/api/redo'){json(res,200,studio.historyMove('redo'));return;}
      if(req.method==='POST'&&url.pathname==='/api/restore'){const p=await bodyJson(req);json(res,200,studio.restore(p.snapshot,p.baseRevision));return;}
      if(req.method==='POST'&&url.pathname==='/api/reset'){const p=await bodyJson(req);if(p.confirmed!==true)throw new SceneError('Konfirmasi reset diperlukan');json(res,200,studio.reset());return;}
      json(res,404,{error:'Endpoint tidak tersedia'});return;
    }
    if(req.method!=='GET'&&req.method!=='HEAD'){json(res,405,{error:'Method not allowed'});return;}
    let pathname=decodeURIComponent(url.pathname);
    if(pathname==='/')pathname='/index.html';
    const file=path.resolve(WEB,'.'+pathname);
    if(!file.startsWith(WEB+path.sep)){json(res,403,{error:'Forbidden'});return;}
    let st;
    try{st=fs.statSync(file)}catch{json(res,404,{error:'File not found'});return;}
    if(!st.isFile()){json(res,404,{error:'Not a file'});return;}
    res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':pathname==='/index.html'?'no-cache':'max-age=3600','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'none'"});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  }catch(e){json(res,e.status||400,{error:e.message,code:e.code||'INTERNAL_ERROR'});}
});
server.listen(PORT,HOST,()=>console.log(`OSCE Sandbox Studio ready at http://${HOST}:${PORT} | MCP POST /mcp | data: ${DATA}`));
process.on('SIGTERM',()=>server.close());
