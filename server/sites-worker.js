import {SceneError} from './studio.js';
import {SiteSessions} from './site-sessions.js';
import {rpc, toolsList} from './mcp-protocol.js';
import {renderWidget} from './widget-template.js';
import assets from './assets.js';

const widget = renderWidget(assets);
const mime = {
  html: 'text/html; charset=utf-8',
  js: 'text/javascript; charset=utf-8',
  css: 'text/css; charset=utf-8',
  svg: 'image/svg+xml',
  webmanifest: 'application/manifest+json',
};
const safeHeaders = {'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
const siteCsp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; frame-ancestors 'self' https://chatgpt.com";
const json = (data,status=200) => Response.json(data,{status,headers:safeHeaders});
const missingIdentity = () => new SceneError('Masuk dengan ChatGPT untuk membuka proyek.','AUTH_REQUIRED',401);

async function bodyJson(request) {
  if (!request.body) return {};
  const reader=request.body.getReader();
  const decoder=new TextDecoder();
  let count=0, body='';
  while (true) {
    const {done,value}=await reader.read();
    if (done) break;
    count+=value.byteLength;
    if (count>1_500_000) {
      await reader.cancel();
      throw new SceneError('Body melebihi 1.5 MB','TOO_LARGE',413);
    }
    body+=decoder.decode(value,{stream:true});
  }
  body+=decoder.decode();
  try { return body ? JSON.parse(body) : {}; }
  catch { throw new SceneError('JSON tidak valid'); }
}

async function startSession(sessions,context){
  const started=await sessions.create();
  context?.waitUntil?.(sessions.sweep().catch(()=>console.error('Session cleanup failed')));
  return started;
}

async function control(request,bucket,identity,context) {
  if (request.method!=='POST') return new Response(null,{status:405,headers:{Allow:'POST',...safeHeaders}});
  const body=await bodyJson(request);
  if (body?.jsonrpc==='2.0' && body.method==='tools/call' && body.id!==undefined) {
    try {
      const name=body.params?.name;
      if(!toolsList.some(tool=>tool.name===name))throw new SceneError('Tool tidak tersedia.','NOT_FOUND',404);
      const sessions=new SiteSessions(bucket,identity);
      let id=body.params?.arguments?.sessionId;
      if(name==='open_studio'&&!id)id=(await startSession(sessions,context)).sessionId;
      const project=await sessions.open(id);
      const reply=rpc(project.studio,body,()=>widget);
      if (reply?.result?.isError===false) await project.commit();
      return json(reply);
    } catch (error) {
      const problem=error instanceof SceneError ? error : new SceneError('Penyimpanan sesi gagal.','STORAGE_ERROR',500);
      return json({jsonrpc:'2.0',id:body.id,result:{isError:true,content:[{type:'text',text:JSON.stringify({error:problem.message,code:problem.code})}]}});
    }
  }
  const reply=rpc(null,body,()=>widget);
  return reply===null ? new Response(null,{status:202,headers:safeHeaders}) : json(reply);
}

function sessionEvents(sessions,id,signal,revision){
  const deadline=Date.now()+24_000;
  const encoder=new TextEncoder();
  let active=true;
  const stream=new ReadableStream({
    start(controller){controller.enqueue(encoder.encode(': connected\n\n'));},
    async pull(controller){
      if(!active||signal.aborted||Date.now()>=deadline){if(active)controller.close();return;}
      await new Promise(resolve=>setTimeout(resolve,1600));
      if(!active)return;
      try{
        const next=await sessions.revision(id);
        if(!active)return;
        const message=next>revision?'event: scene_updated\ndata: '+JSON.stringify({revision:next})+'\n\n':': waiting\n\n';
        revision=next;
        controller.enqueue(encoder.encode(message));
      }catch(error){
        if(!active)return;
        if(error.code==='SESSION_EXPIRED')controller.enqueue(encoder.encode('event: session_expired\ndata: {}\n\n'));
        controller.close();
      }
    },
    cancel(){active=false;},
  });
  return new Response(stream,{headers:{...safeHeaders,'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform','X-Accel-Buffering':'no'}});
}

async function studioApi(request,pathname,bucket,identity,context) {
  if (!identity) throw missingIdentity();
  const route=request.method+' '+pathname;
  if (route==='GET /api/connection') return json({toolCount:toolsList.length,version:'0.7.0'});
  const sessions=new SiteSessions(bucket,identity);
  if (route==='POST /api/session') return json(await startSession(sessions,context),201);
  if (route==='POST /api/save') return json({error:'Sesi sementara: penyimpanan permanen dinonaktifkan.'},410);
  const id=request.headers.get('x-studio-session');
  if (route==='DELETE /api/session'){await sessions.close(id);return json({ok:true,reset:true});}
  if (route==='GET /api/events') {
    const current=await sessions.revision(id);
    const requested=new URL(request.url).searchParams.get('since');
    const since=requested!==null && /^\d+$/.test(requested) ? Math.min(current,Number(requested)) : current;
    return sessionEvents(sessions,id,request.signal,since);
  }
  const project=await sessions.open(id);
  const {studio}=project;
  const method=request.method;
  if (route==='GET /api/state') return json({sessionId:id,...studio.snapshot()});
  if (route==='GET /api/log') return json(studio.log);
  if (!['POST','PATCH'].includes(method)) return json({error:'Endpoint tidak tersedia'},404);

  const payload=await bodyJson(request);
  let result,status=200;
  switch (route) {
    case 'POST /api/preview': return json(studio.preview(payload.operations,payload.baseRevision));
    case 'POST /api/operations': result=studio.apply(payload.operations,payload.baseRevision); break;
    case 'POST /api/assets': result=studio.createAsset(payload);status=201;break;
    case 'POST /api/behaviors': result=studio.createBehavior(payload);status=201;break;
    case 'POST /api/validate-asset': return json(studio.validateAssetDraft(payload));
    case 'POST /api/validate-behavior': return json(studio.validateBehaviorDraft(payload));
    case 'POST /api/behavior-test': return json(studio.validateBehaviorTest(payload.behaviorId,payload.actions));
    case 'POST /api/undo': result=studio.historyMove('undo');break;
    case 'POST /api/redo': result=studio.historyMove('redo');break;
    case 'POST /api/restore': result=studio.restore(payload.snapshot,payload.baseRevision);break;
    case 'POST /api/reset':
      if (payload.confirmed!==true) throw new SceneError('Konfirmasi reset diperlukan');
      result=studio.reset();break;
    default: {
      const match=method==='PATCH' && /^\/api\/(assets|behaviors)\/([a-zA-Z0-9_-]+)$/.exec(pathname);
      if (!match) return json({error:'Endpoint tidak tersedia'},404);
      result=match[1]==='assets' ? studio.updateAsset(match[2],payload) : studio.updateBehavior(match[2],payload);
    }
  }
  await project.commit();
  return json(result,status);
}

const signInPage='<!doctype html><html lang="id"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OSCE Sandbox Studio</title><link rel="stylesheet" href="/styles.css"><style>main{max-width:38rem;margin:15vh auto;padding:2rem}a{display:inline-block;color:inherit}</style><main><h1>OSCE Sandbox Studio</h1><p>Atur posisi karakter dan rakit alat di editor 3D untuk latihan OSCE.</p><a class="panel-btn" href="/signin-with-chatgpt?return_to=%2F" target="_top">Masuk dengan ChatGPT</a></main></html>';

export default {
  async fetch(request,env,context) {
    const url=new URL(request.url);
    const pathname=url.pathname;
    const identity=request.headers.get('oai-authenticated-user-id');
    try {
      if (pathname==='/health') return json({ok:!!env.STUDIO,server:'osce-sandbox-studio',version:'0.7.0',persistentProjects:false},env.STUDIO?200:503);
      if (pathname==='/mcp' || pathname.startsWith('/api/')) {
        const origin=request.headers.get('Origin');
        if (origin && origin!==url.origin) throw new SceneError('Origin tidak diizinkan.','FORBIDDEN',403);
        return pathname==='/mcp' ? await control(request,env.STUDIO,identity,context) : await studioApi(request,pathname,env.STUDIO,identity,context);
      }
      if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
      const file=pathname==='/' ? 'index.html' : pathname.slice(1);
      if (!Object.hasOwn(assets,file) || file.startsWith('widget')) return json({error:'Halaman tidak ditemukan'},404);
      const contentType=mime[file.split('.').at(-1)] || 'application/octet-stream';
      const content=file==='index.html' && !identity ? signInPage : assets[file];
      return new Response(request.method==='HEAD' ? null : content,{headers:{...safeHeaders,'Content-Type':contentType,'Content-Security-Policy':siteCsp}});
    } catch (error) {
      const problem=error instanceof SceneError ? error : new SceneError('Permintaan studio gagal.','INTERNAL_ERROR',500);
      if (!(error instanceof SceneError)) console.error('Studio request failed',error?.name);
      return json({error:problem.message,code:problem.code},problem.status);
    }
  },
};
