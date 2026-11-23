import {SceneError, Studio} from './studio.js';
import {rpc, toolsList} from './mcp-protocol.js';
import {renderWidget} from './widget-template.js';
import assets from './assets.js';

const widget = renderWidget(assets['index.html'], assets['styles.css'], assets['render3d.js'], assets['app.js']);
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

async function openProject(bucket,identity) {
  if (!identity) throw missingIdentity();
  if (!bucket) throw new SceneError('Penyimpanan proyek belum tersedia.','STORAGE_UNAVAILABLE',503);
  const key='projects/'+encodeURIComponent(identity)+'.json';
  const object=await bucket.get(key);
  const state=object ? await object.json() : null;
  const studio=new Studio(state);
  const revision=studio.scene.revision;

  return {studio, async commit(force=false) {
    if (!force && studio.scene.revision===revision) return;
    if (force && object && studio.scene.revision===revision) return;
    const onlyIf=object ? {etagMatches:object.etag} : new Headers({'If-None-Match':'*'});
    const state=studio.storedState();
    const serialized=JSON.stringify(state);
    if (new TextEncoder().encode(serialized).length>12_000_000) {
      throw new SceneError('Proyek dan riwayat melebihi batas penyimpanan.','PROJECT_TOO_LARGE',413);
    }
    const result=await bucket.put(key,serialized,{onlyIf,httpMetadata:{contentType:'application/json'}});
    if (!result) throw new SceneError('Revisi konflik. Muat ulang proyek sebelum mengedit.','REVISION_CONFLICT',409);
  }};
}

async function control(request,bucket,identity) {
  if (request.method!=='POST') return new Response(null,{status:405,headers:{Allow:'POST',...safeHeaders}});
  const body=await bodyJson(request);
  if (body?.jsonrpc==='2.0' && body.method==='tools/call' && body.id!==undefined) {
    try {
      const project=await openProject(bucket,identity);
      const save=body.params?.name==='save_scene';
      const reply=rpc(project.studio,body,()=>widget);
      if (reply?.result?.isError===false) {
        await project.commit(save);
        if (save) {
          reply.result.structuredContent.stored=true;
          reply.result.content[0].text=JSON.stringify(reply.result.structuredContent);
        }
      }
      return json(reply);
    } catch (error) {
      const problem=error instanceof SceneError ? error : new SceneError('Penyimpanan proyek gagal.','STORAGE_ERROR',500);
      return json({jsonrpc:'2.0',id:body.id,result:{isError:true,content:[{type:'text',text:JSON.stringify({error:problem.message,code:problem.code})}]}});
    }
  }
  const reply=rpc(null,body,()=>widget);
  return reply===null ? new Response(null,{status:202,headers:safeHeaders}) : json(reply);
}

async function studioApi(request,pathname,bucket,identity) {
  if (!identity) throw missingIdentity();
  if (request.method==='GET' && pathname==='/api/connection') return json({toolCount:toolsList.length,version:'0.3.0'});
  const project=await openProject(bucket,identity);
  const {studio}=project;
  const method=request.method;
  const route=method+' '+pathname;
  if (route==='GET /api/state') return json(studio.snapshot());
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
    case 'POST /api/save':
      await project.commit(true);
      return json({ok:true,stored:true,revision:studio.scene.revision});
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
  async fetch(request,env) {
    const url=new URL(request.url);
    const pathname=url.pathname;
    const identity=request.headers.get('oai-authenticated-user-id');
    try {
      if (pathname==='/health') return json({ok:!!env.STUDIO,server:'osce-sandbox-studio',version:'0.3.0'},env.STUDIO?200:503);
      if (pathname==='/mcp' || pathname.startsWith('/api/')) {
        const origin=request.headers.get('Origin');
        if (origin && origin!==url.origin) throw new SceneError('Origin tidak diizinkan.','FORBIDDEN',403);
        return pathname==='/mcp' ? await control(request,env.STUDIO,identity) : await studioApi(request,pathname,env.STUDIO,identity);
      }
      if (!['GET','HEAD'].includes(request.method)) return new Response(null,{status:405,headers:{Allow:'GET, HEAD'}});
      const file=pathname==='/' ? 'index.html' : pathname.slice(1);
      if (!Object.hasOwn(assets,file) || file.startsWith('widget')) return json({error:'Halaman tidak ditemukan'},404);
      const contentType=mime[file.split('.').at(-1)] || 'application/octet-stream';
      let content=assets[file];
      if (file==='index.html') {
        const scope=identity ? new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(identity))) : null;
        content=scope ? content.replace('__STUDIO_DRAFT_SCOPE__',Array.from(scope,b=>b.toString(16).padStart(2,'0')).join('')) : signInPage;
      }
      return new Response(request.method==='HEAD' ? null : content,{headers:{...safeHeaders,'Content-Type':contentType,'Content-Security-Policy':siteCsp}});
    } catch (error) {
      const problem=error instanceof SceneError ? error : new SceneError('Permintaan studio gagal.','INTERNAL_ERROR',500);
      if (!(error instanceof SceneError)) console.error('Studio request failed',error?.name);
      return json({error:problem.message,code:problem.code},problem.status);
    }
  },
};
