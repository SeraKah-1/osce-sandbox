import {createRenderer} from './render3d.js';

// OSCE Playground v0.4. The same UI runs as a standalone site and an MCP App.
// In an embedded app, mutations go through the host MCP bridge; no simulated AI responses.
const $=id=>document.getElementById(id);
const embedded=Boolean(window.__OSCE_EMBEDDED__);
const previewHost=location.pathname==='/widget' && window.parent===window;
const hosted=!embedded && Boolean(document.querySelector('meta[name="studio-host"]'));
const draftScope=document.querySelector('meta[name="studio-draft-scope"]')?.content;
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toFixed(2);
const session=(()=>{try{return sessionStorage}catch{return {getItem:()=>null,setItem:()=>{}}}})();
const storage=(()=>{try{return embedded ? sessionStorage : localStorage}catch{return {getItem:()=>null,setItem:()=>{},removeItem:()=>{}}}})();
const draftSuffix=hosted ? ':'+draftScope : '';
const DRAFT_KEY='osce-playground-v04-draft'+draftSuffix;
const LEGACY_DRAFT_KEY='osce-playground-v03-draft'+draftSuffix;
const DEFAULT_COMMAND='Buat ruang latihan OSCE yang sederhana. Atur dokter dan pasien, pose awal, serta alat yang diperlukan. Gunakan OSCE Sandbox Studio MCP: baca get_world_state dan get_asset_catalog terlebih dahulu; validasi aset/perilaku baru dan panggil preview_scene_operations untuk perubahan besar; lalu terapkan perubahan dengan baseRevision yang terbaru. Jelaskan keterbatasan simulasi klinis.';
let data=null,selected=null,selectedJoint=null,axis='flexion',pane=null,category='all',selectionExpanded=false;
let pending=[],pendingRevision=null,draft=null,queue=Promise.resolve(),inFlight=0,loading=false,dragActive=false,refreshLock=false;
let lastError='',renderer,toastTimer,hostReady=false,hostKind='local',frameReady=false;
const bridgePending=new Map();let bridgeCounter=0, bridgeOrigin='*';

function status(phase,label){$('syncStatus').textContent=label;$('statusLed').className='status-led '+(phase==='ok'?'ok':phase==='pending'?'pending':phase==='error'?'error':'');$('syncButton').dataset.state=phase;}
function notice(text,error=false){const target=$('toast');clearTimeout(toastTimer);target.textContent=text;target.hidden=false;target.classList.toggle('error',error);toastTimer=setTimeout(()=>{target.hidden=true},error?6000:2500);}
function showError(title,detail){lastError=detail;$('errorTitle').textContent=title;$('errorText').textContent=detail;$('errorBar').hidden=false;}
function clearError(){$('errorBar').hidden=true;lastError='';}
function showLoading(message='Memuat scene'){$('loadingOverlay').hidden=false;$('loadingDetail').textContent=message;$('retryLoad').hidden=true;}
function hideLoading(){$('loadingOverlay').hidden=true;}
function loadingFailure(err){$('loadingDetail').textContent=err;$('retryLoad').hidden=false;status('error','Offline');}
function getDraft(){try{const d=JSON.parse(storage.getItem(DRAFT_KEY)||storage.getItem(LEGACY_DRAFT_KEY)||'null');return d?.snapshot?.scene&&Array.isArray(d.operations)?d:null;}catch{return null;}}
function storeDraft(){try{if(!pending.length){storage.removeItem(DRAFT_KEY);storage.removeItem(LEGACY_DRAFT_KEY);return;}storage.setItem(DRAFT_KEY,JSON.stringify({baseRevision:pendingRevision,operations:pending,snapshot:data,savedAt:new Date().toISOString()}));}catch{showError('Penyimpanan lokal diblokir','Browser tidak mengizinkan penyimpanan draft. Ekspor cadangan sebelum menutup tab.');}}
function parseHostResponse(raw){const result=raw?.result??raw;if(result?.isError){const text=result.content?.find(x=>x.type==='text')?.text||'Perintah MCP gagal';let value;try{value=JSON.parse(text);}catch{}throw Object.assign(Error(value?.error||value?.message||text),{code:value?.code});}if(result?.structuredContent)return result.structuredContent;if(result?.content?.[0]?.text){try{return JSON.parse(result.content[0].text)}catch{}}return result;}
function apiHeaders(){const h={'Content-Type':'application/json'};const t=hosted?null:session.getItem('osce-studio-token');if(t)h.Authorization='Bearer '+t;return h;}
async function api(path,method='GET',payload){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);try{const res=await fetch(path,{method,headers:apiHeaders(),body:payload===undefined?undefined:JSON.stringify(payload),signal:ctrl.signal});const out=await res.json().catch(()=>({error:`HTTP ${res.status}`}));if(!res.ok)throw Object.assign(Error(out.error||`HTTP ${res.status}`),{code:out.code,status:res.status});return out;}catch(e){if(e.name==='AbortError')throw Object.assign(Error('Server tidak merespons (12 detik). Perubahan mungkin sudah diproses; sinkronkan sebelum mengulang.'),{code:'TIMEOUT'});throw e;}finally{clearTimeout(timer)}}
function hostRpc(method,params,timeout=7000){return new Promise((resolve,reject)=>{const id=++bridgeCounter;const timer=setTimeout(()=>{bridgePending.delete(id);reject(Error('Host MCP tidak merespons'))},timeout);bridgePending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},bridgeOrigin);});}
window.addEventListener('message',event=>{
 if(!embedded||event.source!==window.parent||(bridgeOrigin!=='*'&&event.origin!==bridgeOrigin))return;
 const message=event.data;if(message?.jsonrpc!=='2.0')return;
 if(message.method==='ui/notifications/tool-result'&&message.params?.structuredContent?.scene&&renderer&&!pending.length&&!dragActive){
   const next=message.params.structuredContent;
   if(!data||next.scene.revision>data.scene.revision)applyData(next);
   return;
 }
 if(message.id!==undefined&&['ui/resource-teardown','ping'].includes(message.method)){
   window.parent.postMessage({jsonrpc:'2.0',id:message.id,result:{}},bridgeOrigin);return;
 }
 const call=!message.method&&bridgePending.get(message.id);if(!call)return;
 clearTimeout(call.timer);bridgePending.delete(message.id);
 if(message.error)call.reject(Error(message.error.message||'MCP host error'));
 else{if(event.origin && event.origin!=='null')bridgeOrigin=event.origin;call.resolve(message.result);}
});
async function initializeBridge(){
 if(!embedded || hostReady || previewHost)return;
 if(window.openai?.callTool){hostReady=true;hostKind='chatgpt';return;}
 try{await hostRpc('ui/initialize',{protocolVersion:'2026-01-26',appCapabilities:{},appInfo:{name:'osce-playground',version:'0.4.0'}},5000);window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},bridgeOrigin);hostReady=true;hostKind='mcp-app';}
 catch(err){if(window.openai?.callTool){hostReady=true;hostKind='chatgpt';return;}if(previewHost){hostKind='local-preview';hostReady=false;return;}throw Error('Koneksi host ChatGPT belum tersedia: '+err.message);}
}
async function tool(name,args={}){
 if(embedded&&!previewHost&&!hostReady)await initializeBridge();
 if(embedded&&hostReady){let r;if(window.openai?.callTool)r=await window.openai.callTool(name,args);else r=await hostRpc('tools/call',{name,arguments:args});return parseHostResponse(r);}
 if(embedded&&!previewHost)throw Error('Widget belum terhubung dengan host MCP. Coba buka ulang dari ChatGPT.');
 switch(name){
  case 'get_world_state':return api('/api/state');
  case 'get_asset_catalog':{const d=await api('/api/state');return {assets:d.assets,behaviors:d.behaviors};}
  case 'apply_scene_operations':return api('/api/operations','POST',args);
  case 'preview_scene_operations':return api('/api/preview','POST',args);
  case 'create_asset':return api('/api/assets','POST',args);
  case 'create_behavior':return api('/api/behaviors','POST',args);
  case 'validate_asset':return api('/api/validate-asset','POST',args.asset);
  case 'validate_behavior':return api('/api/validate-behavior','POST',args.behavior);
  case 'test_behavior':return api('/api/behavior-test','POST',args);
  case 'save_scene':return api('/api/save','POST',{});
  case 'undo_scene':return api('/api/undo','POST',{});
  case 'redo_scene':return api('/api/redo','POST',{});
  case 'get_execution_log':return api('/api/log');
  case 'reset_world':return api('/api/reset','POST',args);
  default:throw Error('Tool tidak didukung: '+name);
 }
}
function applyData(next){if(!renderer)throw Error('Renderer tidak tersedia');if(!next?.scene?.entities||!Array.isArray(next.assets))throw Error('Format scene dari server tidak lengkap');data=next;renderer.setWorld(data);
 if(selected&&!data.scene.entities.some(e=>e.id===selected)){selected=null;selectedJoint=null;}
 renderer.setSelected(selected,selectedJoint);$('sceneTitle').textContent=data.scene.title;renderSelection();if(pane)renderPane();if(!pending.length)status('ok',`Tersinkron · r${data.scene.revision}`);}
function setRendererStatus(kind,message){const indicator=$('rendererPill');if(kind==='ready'){frameReady=true;indicator.hidden=true;if(data)hideLoading();}
 else if(kind==='recovering'){indicator.hidden=false;indicator.textContent='Memulihkan 3D…';}
 else if(kind==='fallback'){frameReady=true;indicator.hidden=false;indicator.textContent='Mode gambar sederhana · '+message;if(data)hideLoading();}
}
function currentEntity(){return data?.scene.entities.find(e=>e.id===selected);}
function blueprint(e){return data?.assets.find(a=>a.id===e?.assetId);}
function behavior(e){return data?.behaviors.find(b=>b.id===blueprint(e)?.behaviorId);}
function choose(id,joint=null){if(id!==selected)selectionExpanded=false;selected=id;selectedJoint=joint;renderer.setSelected(id,joint);renderSelection();if(pane==='objects')renderPane();}
function stopPane(){pane=null;$('sheet').hidden=true;document.querySelectorAll('[data-panel]').forEach(x=>x.classList.remove('active'));renderSelection();}
function openPane(name){if(pane===name){stopPane();return;}pane=name;$('sheet').hidden=false;$('selectionCard').hidden=true;document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));renderPane();}
function friendlyJoint(name){return name.replace(/^(right|left)/,(_,s)=>s==='right'?'Kanan · ':'Kiri · ').replace('Shoulder','Bahu').replace('Elbow','Siku').replace('Wrist','Pergelangan tangan').replace('Hip','Pinggul').replace('Knee','Lutut').replace('Ankle','Pergelangan kaki').replace('neck','Leher').replace('spine','Punggung');}
function renderSelection(){const el=$('selectionCard'),e=currentEntity();if(!e||pane){el.hidden=true;return;}el.hidden=false;el.classList.toggle('compact',!selectionExpanded);$('selectionExpand').setAttribute('aria-expanded',String(selectionExpanded));$('selectionName').textContent=e.name;$('selectionKicker').textContent=e.type==='character'?'BONEKA · '+(e.role==='doctor'?'DOKTER':'PASIEN'):'OBJEK · '+(e.status||'BEBAS');
 if(e.type==='character'){
  const joint=selectedJoint&&e.pose[selectedJoint]?selectedJoint:null;
  const label=joint?friendlyJoint(joint):'Seluruh tubuh';
  $('selectionBody').innerHTML=`<div class="pose-caption"><span class="pose-dot"></span><span>${esc(label)} · seret boneka langsung di layar</span></div><div class="row-actions"><button class="soft-button" data-operation="rotate-left" title="Putar boneka 30 derajat ke kiri">↶ Putar</button><button class="soft-button" data-operation="rotate-right" title="Putar boneka 30 derajat ke kanan">↷ Putar</button></div><div class="row-actions"><button class="soft-button" data-operation="pose-standing">Berdiri</button><button class="soft-button" data-operation="pose-sitting">Duduk</button></div><p class="hint">Tarik dada untuk memindahkan tubuh. Tarik pergelangan tangan atau kaki untuk mengatur pose. Lepaskan untuk membekukan posisi.</p>`;
 }else{
  const b=behavior(e),actions=(b?.transitions||[]).filter(t=>t.from===(e.status??b?.initial));
  $('selectionBody').innerHTML=`<div class="pose-caption"><span class="pose-dot"></span><span>Seret objek untuk memindahkan</span></div>${actions.length?`<div class="row-actions">${actions.map(x=>`<button type="button" class="primary-button" data-action="${esc(x.action)}">${esc(x.label)}</button>`).join('')}</div>`:''}<div class="row-actions"><button class="soft-button" data-operation="rotate-left">↶ Putar</button><button class="soft-button" data-operation="rotate-right">↷ Putar</button></div><div class="row-actions"><button class="soft-button" data-operation="attach-doctor">Pegang dokter</button><button class="soft-button" data-operation="attach-patient">Pegang pasien</button>${e.attachedTo?'<button class="soft-button" data-operation="detach">Lepas</button>':''}</div><div class="row-actions"><button type="button" class="soft-button" data-operation="duplicate">Duplikasi</button><button type="button" class="danger-button" data-operation="delete">Hapus</button></div>`;
 }
}
const navTitles={add:['ADD TO WORLD','Tambah objek'],ask:['AI BUILDER','Ask ChatGPT'],practice:['PRACTICE','Latihan OSCE'],more:['WORKSPACE','Pengaturan'],objects:['SCENE TREE','Semua objek'],advanced:['ADVANCED','Asset & Behavior'],diagnostics:['CONNECTION','Status & diagnostik']};
function renderPane(){if(!pane)return;
 if(!data){
   $('sheetEyebrow').textContent='KONEKSI';$('sheetTitle').textContent='Hubungkan studio';
   $('sheetBody').innerHTML=`<p>${hosted?'Data scene belum tersedia. Coba sinkronkan ulang setelah masuk dengan ChatGPT.':'Data scene belum tersedia. Untuk server lokal dengan API_TOKEN, masukkan token yang sah.'}</p>${!embedded&&!hosted?`<label class="field"><span>Token server</span><input id="serverToken" type="password" autocomplete="off" placeholder="Bearer API_TOKEN"></label><button class="primary-button" data-ui="set-token">Hubungkan</button>`:''}<div class="row-actions"><button class="soft-button" data-ui="sync-now">Coba muat ulang</button></div><p class="hint">${esc(lastError||'Server offline atau host ChatGPT belum tersedia.')}</p>`;
   return;
 }
 const [eyebrow,title]=navTitles[pane]||['STUDIO','Panel'];$('sheetEyebrow').textContent=eyebrow;$('sheetTitle').textContent=title;let html='';
 if(pane==='add'){
  html=`<p>Ketuk untuk menambahkan ke dunia. Objek langsung tampil dan dapat di-undo.</p><div class="seg-tabs"><button data-cat="all" class="${category==='all'?'active':''}">Semua</button><button data-cat="Furnitur" class="${category==='Furnitur'?'active':''}">Furnitur</button><button data-cat="Alat" class="${category==='Alat'?'active':''}">Alat</button></div>${category==='all'?`<h3>Karakter</h3><div class="asset-grid"><button class="asset-choice" data-spawn-character="doctor"><span class="asset-icon">${icon('hand')}</span><span><strong>Dokter</strong><small>Puppet mint</small></span></button><button class="asset-choice" data-spawn-character="patient"><span class="asset-icon peach">${icon('hand')}</span><span><strong>Pasien</strong><small>Puppet peach</small></span></button></div>`:''}<h3>Objek & instrumen</h3><div class="asset-grid">${data.assets.filter(a=>category==='all'||a.category===category).map(a=>`<button class="asset-choice" data-spawn="${esc(a.id)}"><span class="asset-icon blue">${icon('box')}</span><span><strong>${esc(a.name)}</strong><small>${esc(a.category||'Custom')} · ${a.parts.length} bagian</small></span></button>`).join('')}</div>`;
 }
 if(pane==='ask'){
  html=`<p>${embedded&&!previewHost?'Beritahu ChatGPT apa yang ingin dibuat atau diubah. ChatGPT akan menggunakan tool MCP yang terhubung.':'Untuk situs mandiri, kirim instruksi melalui ChatGPT yang terhubung dengan plugin OSCE. Panel ini tidak berpura-pura menjadi chatbot.'}</p><label class="field"><span>Instruksi</span><textarea id="aiPrompt" rows="5" maxlength="3000" placeholder="Misalnya: buat ruangan pemeriksaan saraf, atur posisi pasien, dan siapkan alat...">${esc(window.__lastPrompt||'')}</textarea></label><div class="row-actions">${embedded&&!previewHost?'<button class="primary-button" data-ui="send-chat">Kirim ke ChatGPT</button>':'<button class="primary-button" data-ui="copy-chat">Salin instruksi</button><button class="soft-button" data-ui="open-chat">Buka ChatGPT</button>'}</div><p class="hint">ChatGPT harus memvalidasi instrumen dan logikanya sebelum menyimpan perubahan. Pembuatan geometri hanya mendukung kemampuan engine yang tersedia.</p>`;
 }
 if(pane==='practice'){
  const s=data.scene.scenario;const total=s.steps.length,done=s.completed?.length||0;
  html=`<p>Pilih kasus, lalu tandai tahap yang benar-benar sudah lu kerjakan. Sistem tidak memberikan skor teknik otomatis.</p><label class="field"><span>Skenario</span><select id="scenarioPicker">${data.templates.map(t=>`<option value="${esc(t.id)}" ${s.id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}${s.generated?`<option value="custom" selected>${esc(s.name)} (custom)</option>`:''}</select></label><div class="status-desc">${esc(s.patient?.complaint||'Latihan umum')} · ${done} / ${total} tahap selesai</div><h3>Checklist latihan</h3>${s.steps.map((step,i)=>`<label class="step"><input type="checkbox" data-step="${i}" ${(s.completed||[]).includes(i)?'checked':''}><span>${esc(step)}</span></label>`).join('')}<p class="hint">${esc(s.note||'')}</p>`;
 }
 if(pane==='more'){
  html=`<p>Kontrol penting dan pengaturan lanjutan disimpan di sini agar playground tetap bersih.</p><div class="row-actions"><button class="soft-button" data-ui="redo">${icon('redo')} Redo</button><button class="soft-button" data-ui="reset-camera">${icon('focus')} Reset kamera</button></div><div class="row-actions"><button class="soft-button" data-ui="export">${icon('download')} Ekspor proyek</button>${embedded&&!previewHost?'':'<button class="soft-button" data-ui="import">Impor proyek</button>'}</div><div class="section-divider"></div><div class="object-list"><button class="object-choice" data-open="objects">${icon('list')} <strong>Semua objek</strong>${icon('arrow')}</button><button class="object-choice" data-open="diagnostics">${icon('cloud')} <strong>Sinkronisasi & MCP</strong>${icon('arrow')}</button><button class="object-choice" data-open="advanced">${icon('box')} <strong>Editor data lanjutan</strong>${icon('arrow')}</button></div><div class="section-divider"></div><button class="danger-button" data-ui="reset-world">Reset scene ke awal</button>`;
 }
 if(pane==='objects')html=`<p>Pilih objek dari daftar jika sulit disentuh karena tertutup objek lain.</p><div class="object-list">${data.scene.entities.map(e=>`<button class="object-choice ${e.id===selected?'active':''}" data-entity="${esc(e.id)}">${icon(e.type==='character'?'hand':'box')} <strong>${esc(e.name)}</strong><span class="tag">${esc(e.type==='character'?e.role:e.assetId)}</span></button>`).join('')}</div><div class="row-actions"><button class="soft-button" data-open="more">Kembali</button></div>`;
 if(pane==='diagnostics')html=`<div class="status-desc ${pending.length?'error':''}">${pending.length?`Ada ${pending.length} perubahan lokal yang belum disinkronkan.`:'Scene tersinkron atau sedang memeriksa koneksi.'}</div><h3>MCP / API</h3><div class="code-line" id="diagSummary">${embedded?(hostReady?'Host MCP terhubung ('+esc(hostKind)+')':'Host MCP belum terverifikasi'):'Alamat server: '+esc(location.origin+'/mcp')}</div><div class="row-actions"><button class="primary-button" data-ui="check-mcp">Uji MCP sekarang</button><button class="soft-button" data-ui="sync-now">Sinkronkan</button></div>${!embedded&&!hosted?`<label class="field"><span>Token server (hanya disimpan untuk tab ini)</span><input id="serverToken" type="password" autocomplete="off" value="${esc(session.getItem('osce-studio-token')||'')}" placeholder="Jika server meminta token"></label><button class="soft-button" data-ui="set-token">Simpan token sesi</button>`:''}<h3>Cadangan & pemulihan</h3><div class="row-actions"><button class="soft-button" data-ui="export">Ekspor data lokal</button>${pending.length?'<button class="danger-button" data-ui="discard-draft">Buang draft offline</button>':''}</div><h3>Riwayat</h3><div class="object-list" id="recentLog"><span class="hint">Pilih “Uji MCP sekarang” untuk status, atau lihat riwayat yang tersimpan di server.</span></div><button class="soft-button" data-ui="load-log">Muat riwayat</button><div class="row-actions"><button class="soft-button" data-open="more">Kembali</button></div>`;
 if(pane==='advanced'){
  html=`<p>Untuk pengguna yang membutuhkan kendali penuh: definisi alat dan logika bekerja sungguhan setelah divalidasi server. Tidak ada eksekusi JavaScript buatan AI.</p><h3>Asset Factory</h3><label class="field"><span>Definisi aset JSON</span><textarea class="code" id="assetJSON" spellcheck="false">${esc(window.__assetDraft||JSON.stringify({id:'probe-custom',name:'Probe latihan',category:'Alat',parts:[{shape:'cylinder',position:[0,0,0],size:[.06,.32,.06],color:'#648bca'}],anchors:[{id:'grip',position:[0,0,0]}]},null,2))}</textarea></label><div class="row-actions"><button class="soft-button" data-ui="validate-asset">Periksa aset</button><button class="primary-button" data-ui="create-asset">Simpan aset</button></div><h3>Behavior Engine</h3><label class="field"><span>Definisi status & transisi JSON</span><textarea class="code" id="behaviorJSON" spellcheck="false">${esc(window.__behaviorDraft||JSON.stringify({id:'switch-custom',name:'Saklar latihan',states:['off','on'],initial:'off',transitions:[{from:'off',action:'on',to:'on',label:'Aktifkan'},{from:'on',action:'off',to:'off',label:'Matikan'}]},null,2))}</textarea></label><div class="row-actions"><button class="soft-button" data-ui="validate-behavior">Periksa perilaku</button><button class="primary-button" data-ui="create-behavior">Simpan perilaku</button></div><div class="row-actions"><button class="soft-button" data-open="more">Kembali</button></div>`;
 }
 $('sheetBody').innerHTML=html;
}
function offlineEligible(ops){
 if(!ops.length||ops.length>12)return false;
 if(ops.length===1)return ['set_joint','move_entity','rotate_entity'].includes(ops[0].type);
 return ops.every(op=>op.type==='set_joint'&&op.entityId===ops[0].entityId);
}
function appendOffline(ops,baseRevision){
 if(pendingRevision===null)pendingRevision=baseRevision;
 // Last-write-wins coalescing keeps lengthy stop-motion sessions under the server's 50-op transaction limit.
 const combined=new Map();
 for(const op of [...pending,...ops]){
  const k=op.type==='set_joint'?`joint:${op.entityId}:${op.joint}:${op.axis}`:`${op.type}:${op.entityId}`;
  combined.set(k,op);
 }
 if(combined.size>50)throw Error('Draft terlalu besar. Hubungkan kembali atau ekspor proyek sebelum melanjutkan.');
 pending=[...combined.values()];storeDraft();status('error',`Offline · ${pending.length} perubahan`);
}
async function updateScene(operations,options={}){
 if(!data)throw Error('Scene belum dimuat');
 if(pending.length){if(offlineEligible(operations)){appendOffline(operations,pendingRevision);return {queued:true};}throw Error('Masih ada perubahan offline. Sinkronkan terlebih dahulu sebelum menambah objek.');}
 const baseRevision=options.baseRevision??data.scene.revision;inFlight++;status('pending','Menyimpan…');
 try{const result=await tool('apply_scene_operations',{operations,baseRevision});await reload({force:true});clearError();status('ok',`Tersinkron · r${data.scene.revision}`);return result;}
 catch(err){
  if((err.code==='TIMEOUT'||err.name==='TypeError'||/fetch|network|Failed to fetch/i.test(err.message))&&offlineEligible(operations)){
   appendOffline(operations,baseRevision);showError('Belum tersinkron','Perubahan pose tersimpan sebagai draft lokal. Sinkronkan sebelum menutup atau memuat ulang.');return {queued:true};
  }
  if(!pending.length)await reload({force:true,quiet:true}).catch(()=>{});
  status('error','Perlu diperiksa');showError(err.code==='REVISION_CONFLICT'?'Scene berubah di tempat lain':'Perubahan gagal',err.message);throw err;
 }finally{inFlight--;}
}
function mutate(ops,options){const task=queue.then(()=>updateScene(ops,options));queue=task.catch(()=>{});return task;}
async function reload({quiet=false,force=false}={}){
 if(refreshLock){if(!force)return;while(refreshLock)await new Promise(resolve=>setTimeout(resolve,25));}
 if((inFlight>0||dragActive)&&!force)return;
 refreshLock=true;try{
  const latest=await tool('get_world_state');
  if(dragActive)return;
  if(pending.length){if(latest.scene.revision!==pendingRevision){status('error','Konflik perubahan');showError('Perubahan bersamaan','Scene server sudah berubah sejak draft dibuat. Ekspor draft sebelum memutuskan pemulihan; sistem tidak akan menimpa data orang lain.');return;}
    const result=await tool('apply_scene_operations',{baseRevision:pendingRevision,operations:pending});if(!result.ok)throw Error(result.error||'Sinkronisasi draft gagal');pending=[];pendingRevision=null;storeDraft();const committed=await tool('get_world_state');applyData(committed);
  }else if(force||!quiet||!data||latest.scene.revision!==data.scene.revision)applyData(latest);
  else status('ok',`Tersinkron · r${data.scene.revision}`);
  if(!frameReady){$('loadingDetail').textContent='Menyiapkan 3D…';setTimeout(()=>{if(!frameReady&&data){$('loadingDetail').textContent='GPU sedang menyiapkan tampilan…';}},600);}
  else hideLoading();if(!quiet)clearError();
 }catch(err){status('error',pending.length?'Draft belum sinkron':'Offline');if(!quiet){showError('Tidak dapat membaca scene',err.message);if(!data)loadingFailure(err.message);}throw err;}finally{refreshLock=false;}
}
async function performTool(name,args={},success){inFlight++;status('pending','Memproses…');try{const result=await tool(name,args);if(name!=='get_execution_log'&&name!=='validate_asset'&&name!=='validate_behavior'&&name!=='test_behavior')await reload({force:true,quiet:true});if(success)notice(success);if(!pending.length)status('ok',`Tersinkron · r${data.scene.revision}`);return result;}catch(err){status('error','Perlu diperiksa');showError('Operasi gagal',err.message);throw err;}finally{inFlight--;}}
function safeID(prefix){return prefix+'-'+(globalThis.crypto?.randomUUID?.().slice(0,8)||Math.random().toString(36).slice(2,10));}
function spawnPosition(furniture){const offset=(data?.scene.entities.length||0)%6;return furniture?[0.6+offset*.22,0,-.7+offset*.21]:[0.35+offset*.19,.82,.4+offset*.14];}
async function execute(kind,payload){const e=currentEntity();try{
 switch(kind){
  case 'spawn-character':{const role=payload;const id=safeID('human');await mutate([{type:'spawn_character',id,role,name:role==='doctor'?'Dokter baru':'Pasien baru',position:role==='doctor'?[-1.7,0,1.3]:[1.1,0,1.3]}]);choose(id);stopPane();notice('Boneka ditambahkan');break;}
  case 'spawn-asset':{const a=data.assets.find(x=>x.id===payload);if(!a)throw Error('Aset tidak ada dalam katalog');const id=safeID('object');await mutate([{type:'spawn_asset',id,assetId:a.id,position:spawnPosition(a.category==='Furnitur')}]);choose(id);stopPane();notice(a.name+' ditambahkan');break;}
  case 'joint-reset':if(e&&selectedJoint)await mutate([{type:'set_joint',entityId:e.id,joint:selectedJoint,axis,angle:0}]);break;
  case 'pose-standing':case 'pose-sitting':if(e)await mutate([{type:'apply_pose',entityId:e.id,presetId:kind.replace('pose-','')}]);break;
  case 'rotate-left':case 'rotate-right':if(e){const step=kind==='rotate-left'?-Math.PI/6:Math.PI/6;await mutate([{type:'rotate_entity',entityId:e.id,rotation:[e.rotation?.[0]||0,Math.atan2(Math.sin((e.rotation?.[1]||0)+step),Math.cos((e.rotation?.[1]||0)+step)),e.rotation?.[2]||0]}]);}break;
  case 'attach-doctor':case 'attach-patient':if(e)await mutate([{type:'attach',entityId:e.id,targetId:kind.replace('attach-',''),anchor:'rightHand'}]);break;
  case 'detach':if(e)await mutate([{type:'detach',entityId:e.id}]);break;
  case 'duplicate':if(e?.type==='asset'){const id=safeID('copy');await mutate([{type:'spawn_asset',id,assetId:e.assetId,position:[e.position[0]+.25,e.position[1],e.position[2]+.25],rotation:e.rotation}]);choose(id);}break;
  case 'delete':if(e&&confirm('Hapus '+e.name+' dari scene?')){await mutate([{type:'delete_entity',entityId:e.id}]);choose(null);}break;
  case 'save':{const r=await performTool('save_scene',{},null);if(!r.stored)throw Error('Server tidak memiliki penyimpanan permanen');notice('Scene disimpan di server');break;}
  case 'undo':await performTool('undo_scene',{},'Undo selesai');break;
  case 'redo':await performTool('redo_scene',{},'Redo selesai');break;
  case 'reset-camera':renderer.resetCamera();notice('Kamera kembali ke posisi awal');break;
  case 'export':download('osce-playground-r'+data.scene.revision+'.json',JSON.stringify(data,null,2));notice('Cadangan diunduh');break;
  case 'import':$('importFile').click();break;
  case 'reset-world':if(confirm('Reset seluruh scene ke kondisi awal? Ini mengubah proyek tersimpan.')){await performTool('reset_world',{confirmed:true},'Scene dikembalikan ke awal');stopPane();}break;
  case 'check-mcp':{
    const summary=$('diagSummary');
    if(embedded&&!previewHost){
      const scene=await tool('get_world_state');
      if(summary)summary.textContent=`Host ${hostKind} terhubung · revisi ${scene.scene.revision}.`;
    }else{
      const count=hosted?(await api('/api/connection')).toolCount:(await api('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list',params:{}})).result?.tools?.length;
      if(!count)throw Error('Katalog MCP tidak tersedia');
      if(summary)summary.textContent=`Server MCP menyediakan ${count} tool · /mcp`;
    }
    notice('Pemeriksaan MCP berhasil');break;
  }
  case 'sync-now':await reload({force:true});notice('Sinkronisasi diperiksa');break;
  case 'set-token':session.setItem('osce-studio-token',$('serverToken').value.trim());await reload({force:true});if(data)stopPane();notice('Token sesi diperbarui');break;
  case 'discard-draft':if(confirm('Buang perubahan lokal yang belum terkirim?')){pending=[];pendingRevision=null;storeDraft();await reload({force:true});clearError();}break;
  case 'load-log':{const logs=await tool('get_execution_log');const array=Array.isArray(logs)?logs:logs.result||[];const holder=$('recentLog');if(holder)holder.innerHTML=array.slice(0,12).map(l=>`<div class="status-desc">${esc(l.label)} · r${esc(l.revision)}<br><span class="meta">${esc(l.at)}</span></div>`).join('')||'<p>Belum ada riwayat.</p>';break;}
  case 'validate-asset':case 'create-asset':{const raw=$('assetJSON').value;window.__assetDraft=raw;const a=JSON.parse(raw);const r=await performTool(kind==='create-asset'?'create_asset':'validate_asset',kind==='create-asset'?a:{asset:a});notice(kind==='create-asset'?'Aset tersedia di katalog':'Aset valid: '+r.partCount+' bagian');break;}
  case 'validate-behavior':case 'create-behavior':{const raw=$('behaviorJSON').value;window.__behaviorDraft=raw;const b=JSON.parse(raw);const r=await performTool(kind==='create-behavior'?'create_behavior':'validate_behavior',kind==='create-behavior'?b:{behavior:b});notice(kind==='create-behavior'?'Perilaku disimpan':'Perilaku valid: '+r.transitionCount+' transisi');break;}
  case 'send-chat':case 'copy-chat':case 'open-chat':{
    const prompt=$('aiPrompt')?.value.trim()||'';if(!prompt)throw Error('Tulis instruksi terlebih dahulu');window.__lastPrompt=prompt;
    const full=prompt+'\n\n'+DEFAULT_COMMAND;
    if(kind==='send-chat'){
      if(window.openai?.sendFollowUpMessage)await window.openai.sendFollowUpMessage({prompt:full});
      else if(hostReady)await hostRpc('ui/message',{role:'user',content:[{type:'text',text:full}]});
      else throw Error('Host ChatGPT tidak terhubung.');
      notice('Instruksi dikirim ke ChatGPT');stopPane();
    }else if(kind==='copy-chat'){
      if(!navigator.clipboard?.writeText)throw Error('Clipboard tidak tersedia. Buka situs melalui HTTPS/localhost.');await navigator.clipboard.writeText(full);notice('Instruksi disalin. Tempel di ChatGPT yang terhubung ke plugin OSCE.');
    }else window.open('https://chatgpt.com/','_blank','noopener,noreferrer');
    break;
  }
 }
 }catch(err){showError('Tindakan gagal',err.message);notice(err.message,true);}}
function download(name,text){const blob=new Blob([text],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000);}

// Renderer initialization and user feedback.
try{renderer=createRenderer($('scene3d'),$('hotspots'),{
 onRendererStatus:setRendererStatus,onRendererError:e=>showError('Renderer bermasalah',e.message),
 onSelect(id,joint){choose(id,joint);},
 onPreviewPose(id,joint,pose,g){if(selected===id){const title=$('selectionKicker');if(title)title.textContent='MENGATUR POSE · '+friendlyJoint(joint);if(g?.ikError>24)$('interactionHint').textContent='Batas jangkauan tercapai · putar kamera atau tarik lebih dekat';}},
 onPreviewPosition(id,p){if(selected===id){const title=$('selectionKicker');if(title)title.textContent='MEMINDAHKAN · '+p.map(fmt).join(' / ');}},
 onGesture(phase,hit){if(phase==='start'){if(hit){selectionExpanded=false;renderSelection();}dragActive=!!hit;document.body.classList.toggle('puppet-dragging',!!hit);const attached=hit&&data?.scene?.entities.find(e=>e.id===hit.entityId)?.attachedTo;$('interactionHint').textContent=attached?'Objek terpasang · buka tindakan objek untuk melepas':hit?.kind==='pose'?'Tarik tangan/kaki · Lepas untuk membekukan':hit?'Geser objek · Lepas untuk menyimpan':'Geser ruang kosong untuk memutar kamera';}
  if(phase==='camera'){$('interactionHint').textContent='Dua jari: zoom dan geser kamera';dragActive=true;}
  if(phase==='end'||phase==='cancel'){dragActive=false;document.body.classList.remove('puppet-dragging');$('interactionHint').textContent='Tarik tubuh, tangan, atau kaki · Cubit untuk zoom';if(selected)renderSelection();}},
 onCommitOperations(operations,baseRevision){mutate(operations,{baseRevision}).catch(()=>{});}

});}catch(err){showError('Grafis tidak dapat dimulai',err.message);loadingFailure(err.message);}

// Event delegation: every visible control has a concrete action.
document.querySelectorAll('[data-panel]').forEach(button=>button.addEventListener('click',()=>openPane(button.dataset.panel)));
$('moreBtn').addEventListener('click',()=>openPane('more'));
$('syncButton').addEventListener('click',()=>openPane('diagnostics'));
$('sheetClose').addEventListener('click',stopPane);
$('selectionClose').addEventListener('click',()=>choose(null));
$('selectionExpand').addEventListener('click',()=>{selectionExpanded=!selectionExpanded;renderSelection();});
$('resetCamera').addEventListener('click',()=>execute('reset-camera'));
$('focusBtn').addEventListener('click',()=>{if(selected)renderer.focusEntity(selected)});
$('undoBtn').addEventListener('click',()=>execute('undo'));
$('saveBtn').addEventListener('click',()=>execute('save'));
$('errorDismiss').addEventListener('click',clearError);
$('retryLoad').addEventListener('click',()=>{showLoading('Menghubungkan ulang…');reload({force:true}).catch(()=>{});});
$('sheetBody').addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.open){openPane(b.dataset.open);return;}
 if(b.dataset.cat){category=b.dataset.cat;renderPane();return;}
 if(b.dataset.spawn)await execute('spawn-asset',b.dataset.spawn);
 if(b.dataset.spawnCharacter)await execute('spawn-character',b.dataset.spawnCharacter);
 if(b.dataset.entity){choose(b.dataset.entity);stopPane();return;}
 if(b.dataset.ui)await execute(b.dataset.ui);
});
$('sheetBody').addEventListener('change',async event=>{
 const b=event.target;
 if(b.id==='scenarioPicker'&&b.value!=='custom')await mutate([{type:'set_scenario',templateId:b.value}]).catch(()=>{});
 if(b.matches('[data-step]'))await mutate([{type:b.checked?'complete_step':'uncomplete_step',index:Number(b.dataset.step)}]).catch(()=>{});
});
$('sheetBody').addEventListener('input',event=>{if(event.target.id==='assetJSON')window.__assetDraft=event.target.value;if(event.target.id==='behaviorJSON')window.__behaviorDraft=event.target.value;if(event.target.id==='aiPrompt')window.__lastPrompt=event.target.value;});
$('selectionBody').addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.action&&currentEntity())await mutate([{type:'trigger_action',entityId:selected,action:b.dataset.action}]).catch(()=>{});
 if(b.dataset.operation)await execute(b.dataset.operation);
});
$('selectionBody').addEventListener('change',async event=>{
 const b=event.target;if(!currentEntity())return;

});
$('selectionBody').addEventListener('input',event=>{
 const b=event.target;if(!data||!currentEntity())return;

});
$('importFile').addEventListener('change',async event=>{const file=event.target.files[0];if(!file)return;try{if(file.size>1_500_000)throw Error('File terlalu besar (maksimal 1,5 MB)');const parsed=JSON.parse(await file.text());if(!confirm('Timpa scene saat ini dengan file ini?'))return;if(embedded)throw Error('Impor snapshot hanya tersedia lewat situs mandiri karena tool restore belum dipublikasikan pada host.');await api('/api/restore','POST',{snapshot:parsed,baseRevision:data.scene.revision});await reload({force:true});notice('Scene dipulihkan dari file');}catch(err){showError('Impor gagal',err.message);}finally{event.target.value='';}});
document.addEventListener('keydown',event=>{const inField=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(event.key==='Escape'){if(pane)stopPane();else choose(null);}if(!inField&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();execute(event.shiftKey?'redo':'undo');}});
window.addEventListener('online',()=>reload({quiet:true,force:true}).catch(()=>{}));
window.addEventListener('unhandledrejection',event=>{showError('Proses gagal',event.reason?.message||'Permintaan tidak selesai.');});

async function boot(){
 showLoading();draft=getDraft();
 if(draft){pending=draft.operations;pendingRevision=draft.baseRevision;if(draft.snapshot){try{applyData(draft.snapshot);status('error',`Draft lokal · ${pending.length}`);}catch{}}}
 try{
  await initializeBridge();
  const initial=window.openai?.toolOutput?.scene?window.openai.toolOutput:null;
  if(initial&&!data)applyData(initial);
  await reload({force:true});
  if(frameReady)hideLoading();
 }catch(err){if(!data)loadingFailure(err.message);showError('Studio belum terhubung',err.message);}
 // Poll only while visible, in the absence of local unsaved activity. The MCP host may not expose SSE.
 setInterval(()=>{if(document.hidden||inFlight||refreshLock||embedded&&!hostReady&&!previewHost)return;reload({quiet:true}).catch(()=>{});},5000);
}
boot();

if(!hosted && !embedded && 'serviceWorker' in navigator && (location.protocol==='https:' || ['127.0.0.1','localhost'].includes(location.hostname))){
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(error=>{console.warn('PWA cache unavailable:',error.message)}));
}
