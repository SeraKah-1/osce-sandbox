import {createRenderer} from './render3d.js';

// OSCE Playground v0.9. Tablet gestures remain transient; MCP-defined environment blueprints persist.
// In an embedded app, mutations go through the host MCP bridge; no simulated AI responses.
const $=id=>document.getElementById(id);
const embedded=Boolean(window.__OSCE_EMBEDDED__);
const previewHost=location.pathname==='/widget' && window.parent===window;
const hosted=!embedded&&Boolean(document.querySelector('meta[name="studio-host"]'));
const icon=name=>`<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=n=>Number(n||0).toFixed(2);
const session=(()=>{try{return sessionStorage}catch{return {getItem:()=>null,setItem:()=>{}}}})();


const DEFAULT_COMMAND='Gunakan create_environment untuk membuat environment permanen baru; setelah itu load_environment untuk menghubungkannya ke sesi tablet. Setiap perubahan selanjutnya lewat MCP otomatis tersimpan di blueprint. Jangan menyimpan pose hasil drag manual. Buat ruang latihan OSCE yang sederhana. Atur dokter dan pasien, pose awal, serta alat yang diperlukan. Gunakan OSCE Sandbox Studio MCP: baca get_world_state dan get_asset_catalog terlebih dahulu; validasi aset/perilaku baru dan panggil preview_scene_operations untuk perubahan besar; lalu terapkan perubahan dengan baseRevision yang terbaru. Jelaskan keterbatasan simulasi klinis.';
let savedEnvironments=[],environmentFetchError='';
let data=null,selected=null,selectedJoint=null,pane=null,category='all',selectionExpanded=false,detailMode=false;
let queue=Promise.resolve(),inFlight=0,loading=false,dragActive=false,refreshLock=false,sessionId=null,remoteDirty=false,remoteRevision=0,eventAbort=null,sessionClosed=false;
let lastError='',renderer,toastTimer,hostReady=false,hostKind='local',frameReady=false;
const bridgePending=new Map();let bridgeCounter=0,bridgeOrigin='*',initialWidgetState=null,receiveInitial;

function status(phase,label){$('syncStatus').textContent=label;$('statusLed').className='status-led '+(phase==='ok'?'ok':phase==='pending'?'pending':phase==='error'?'error':'');$('syncButton').dataset.state=phase;}
function notice(text,error=false){const target=$('toast');clearTimeout(toastTimer);target.textContent=text;target.hidden=false;target.classList.toggle('error',error);toastTimer=setTimeout(()=>{target.hidden=true},error?6000:2500);}
function showError(title,detail){lastError=detail;$('errorTitle').textContent=title;$('errorText').textContent=detail;$('errorBar').hidden=false;}
function clearError(){$('errorBar').hidden=true;lastError='';}
function showLoading(message='Memuat scene'){$('loadingOverlay').hidden=false;$('loadingDetail').textContent=message;$('retryLoad').hidden=true;}
function hideLoading(){$('loadingOverlay').hidden=true;}
function loadingFailure(err){$('loadingDetail').textContent=err;$('retryLoad').hidden=false;status('error','Offline');}
function parseHostResponse(raw){const result=raw?.result??raw;if(result?.isError){const text=result.content?.find(x=>x.type==='text')?.text||'Perintah MCP gagal';let value;try{value=JSON.parse(text);}catch{}throw Object.assign(Error(value?.error||value?.message||text),{code:value?.code});}if(result?.structuredContent)return result.structuredContent;if(result?.content?.[0]?.text){try{return JSON.parse(result.content[0].text)}catch{}}return result;}
function apiHeaders(){const h={'Content-Type':'application/json'};if(sessionId)h['X-Studio-Session']=sessionId;const t=hosted?null:session.getItem('osce-studio-token');if(t)h.Authorization='Bearer '+t;return h;}
async function api(path,method='GET',payload){const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),12000);try{const res=await fetch(path,{method,headers:apiHeaders(),body:payload===undefined?undefined:JSON.stringify(payload),signal:ctrl.signal});const out=await res.json().catch(()=>({error:`HTTP ${res.status}`}));if(!res.ok)throw Object.assign(Error(out.error||`HTTP ${res.status}`),{code:out.code,status:res.status});return out;}catch(e){if(e.name==='AbortError')throw Object.assign(Error('Server tidak merespons (12 detik). Perubahan mungkin sudah diproses; periksa status sesi sebelum mengulang.'),{code:'TIMEOUT'});throw e;}finally{clearTimeout(timer)}}
function hostRpc(method,params,timeout=7000){return new Promise((resolve,reject)=>{const id=++bridgeCounter;const timer=setTimeout(()=>{bridgePending.delete(id);reject(Error('Host MCP tidak merespons'))},timeout);bridgePending.set(id,{resolve,reject,timer});window.parent.postMessage({jsonrpc:'2.0',id,method,params},bridgeOrigin);});}
window.addEventListener('message',event=>{
 if(!embedded||event.source!==window.parent||(bridgeOrigin!=='*'&&event.origin!==bridgeOrigin))return;
 const message=event.data;if(message?.jsonrpc!=='2.0')return;
 if(message.method==='ui/notifications/tool-result'){
   const updated=message.params?.structuredContent;
   if(!updated?.sessionId || !updated.scene)return;
   if(!sessionId){initialWidgetState=updated;receiveInitial?.(updated);return;}
   if(updated.sessionId!==sessionId || updated.scene.revision<=data.scene.revision)return;
   if(!dragActive&&!inFlight)applyData(updated);
   else{remoteDirty=true;remoteRevision=Math.max(remoteRevision,updated.scene.revision);}
   return;
 }
 if(message.id!==undefined&&['ui/resource-teardown','ping'].includes(message.method)){
   window.parent.postMessage({jsonrpc:'2.0',id:message.id,result:{}},bridgeOrigin);return;
 }
 const call=!message.method&&bridgePending.get(message.id);if(!call)return;
 clearTimeout(call.timer);bridgePending.delete(message.id);
 if(message.error)call.reject(Error(message.error.message||'MCP host error'));
 else{if(event.origin&&event.origin!=='null')bridgeOrigin=event.origin;call.resolve(message.result);}
});
async function initializeBridge(){
 if(!embedded||hostReady||previewHost)return;
 if(window.openai?.callTool){hostReady=true;hostKind='chatgpt';return;}
 try{await hostRpc('ui/initialize',{protocolVersion:'2026-01-26',appCapabilities:{},appInfo:{name:'osce-playground',version:'0.9.0'}},5000);window.parent.postMessage({jsonrpc:'2.0',method:'ui/notifications/initialized'},bridgeOrigin);hostReady=true;hostKind='mcp-app';}
 catch(err){if(window.openai?.callTool){hostReady=true;hostKind='chatgpt';return;}if(previewHost){hostKind='local-preview';hostReady=false;return;}throw Error('Koneksi host ChatGPT belum tersedia: '+err.message);}
}
async function tool(name,args={}){
 if(embedded&&!previewHost&&!hostReady)await initializeBridge();
 if(embedded&&hostReady){const uiArgs=['apply_scene_operations','create_asset','create_behavior','update_asset','update_behavior','reset_world'].includes(name)?{...args,saveToEnvironment:false}:args;const argumentsWithSession=sessionId?{...uiArgs,sessionId}:uiArgs;let r;if(window.openai?.callTool)r=await window.openai.callTool(name,argumentsWithSession);else r=await hostRpc('tools/call',{name,arguments:argumentsWithSession});return parseHostResponse(r);}
 if(embedded&&!previewHost)throw Error('Widget belum terhubung dengan host MCP. Coba buka ulang dari ChatGPT.');
 switch(name){
  case 'open_studio':return api('/api/session','POST',{});
  case 'get_world_state':return api('/api/state');
  case 'get_asset_catalog':{const d=await api('/api/state');return {assets:d.assets,behaviors:d.behaviors};}
  case 'apply_scene_operations':return api('/api/operations','POST',args);
  case 'preview_scene_operations':return api('/api/preview','POST',args);
  case 'create_asset':return api('/api/assets','POST',args);
  case 'create_behavior':return api('/api/behaviors','POST',args);
  case 'validate_asset':return api('/api/validate-asset','POST',args.asset);
  case 'validate_behavior':return api('/api/validate-behavior','POST',args.behavior);
  case 'test_behavior':return api('/api/behavior-test','POST',args);
    case 'undo_scene':return api('/api/undo','POST',{});
  case 'redo_scene':return api('/api/redo','POST',{});
  case 'get_execution_log':return api('/api/log');
  case 'reset_world':return api('/api/reset','POST',args);
  default:throw Error('Tool tidak didukung: '+name);
 }
}
function applyData(next){if(!renderer)throw Error('Renderer tidak tersedia');if(!next?.scene?.entities||!Array.isArray(next.assets))throw Error('Format scene dari server tidak lengkap');if(next.sessionId)sessionId=next.sessionId;data=next;renderer.setWorld(data);
 if(selected&&!data.scene.entities.some(e=>e.id===selected)){selected=null;selectedJoint=null;}
 renderer.setSelected(selected,selectedJoint);$('sceneTitle').textContent=data.scene.title;renderSelection();if(pane)renderPane();status('ok',data.environmentId?'Blueprint GPT tersimpan':'Sesi sementara');}
function setRendererStatus(kind,message){const indicator=$('rendererPill');if(kind==='ready'){frameReady=true;indicator.hidden=true;if(data)hideLoading();}
 else if(kind==='recovering'){indicator.hidden=false;indicator.textContent='Memulihkan 3D…';}
 else if(kind==='fallback'){frameReady=true;indicator.hidden=false;indicator.textContent='Mode gambar sederhana · '+message;if(data)hideLoading();}
}
function currentEntity(){return data?.scene.entities.find(e=>e.id===selected);}
function blueprint(e){return data?.assets.find(a=>a.id===e?.assetId);}
function behavior(e){return data?.behaviors.find(b=>b.id===blueprint(e)?.behaviorId);}
function choose(id,joint=null){if(id!==selected){selectionExpanded=false;detailMode=false;renderer.setDetailMode(false);$('detailHud').hidden=true;}selected=id;selectedJoint=joint;renderer.setSelected(id,joint);renderSelection();if(pane==='objects')renderPane();}
function stopPane(){pane=null;$('sheet').hidden=true;document.querySelectorAll('[data-panel]').forEach(x=>x.classList.remove('active'));renderSelection();}
function openPane(name){if(pane===name){stopPane();return;}pane=name;$('sheet').hidden=false;$('selectionCard').hidden=true;document.querySelectorAll('[data-panel]').forEach(x=>x.classList.toggle('active',x.dataset.panel===name));renderPane();if(name==='environments')refreshEnvironments().catch(e=>{environmentFetchError=e.message;renderPane();});}
async function refreshEnvironments(){environmentFetchError='';const r=embedded?await tool('list_environments'):await api('/api/environments');savedEnvironments=r.environments||[];if(pane==='environments')renderPane();}
function friendlyJoint(name){return name.replace(/^(right|left)/,(_,s)=>s==='right'?'Kanan · ':'Kiri · ').replace('Shoulder','Bahu').replace('Elbow','Siku').replace('Wrist','Pergelangan tangan').replace('Hip','Pinggul').replace('Knee','Lutut').replace('Ankle','Pergelangan kaki').replace('neck','Leher').replace('spine','Punggung');}
function renderSelection(){const el=$('selectionCard'),e=currentEntity();if(!e||pane){el.hidden=true;return;}el.hidden=false;el.classList.toggle('compact',!selectionExpanded);$('selectionExpand').setAttribute('aria-expanded',String(selectionExpanded));$('selectionName').textContent=e.name;$('selectionKicker').textContent=e.type==='character'?'BONEKA · '+(e.role==='doctor'?'DOKTER':'PASIEN'):'OBJEK · '+(e.status||'BEBAS');
 if(e.type==='character'){
  const joint=selectedJoint&&e.pose[selectedJoint]?selectedJoint:null;
  const label=joint?friendlyJoint(joint):'Seluruh tubuh';
  $('selectionBody').innerHTML=`<div class="pose-caption"><span class="pose-dot"></span><span>${esc(e.supportedBy?(e.supportedBy.kind==='bed'?'Berbaring':'Duduk')+' · '+label:label)} · seret boneka langsung di layar</span></div><div class="row-actions"><button class="soft-button" data-operation="rotate-left" title="Putar boneka 30 derajat ke kiri">↶ Putar</button><button class="soft-button" data-operation="rotate-right" title="Putar boneka 30 derajat ke kanan">↷ Putar</button></div><div class="row-actions"><button class="soft-button" data-operation="pose-standing">Berdiri</button><button class="soft-button" data-operation="pose-sitting">Duduk</button></div><p class="hint">Tarik tubuh untuk memindahkan, tarik tangan/kaki untuk berpose. Tarik ikon putar ⟳ di dekat boneka untuk merotasi tubuh.</p>`;
 }else{
  const a=blueprint(e),b=behavior(e),actions=(b?.transitions||[]).filter(t=>t.from===(e.status??b?.initial));
  $('selectionBody').innerHTML=`<div class="pose-caption"><span class="pose-dot"></span><span>${a?.movable===false?'Objek tidak bisa dipindahkan':'Seret untuk memindahkan · tarik ikon ⟳ untuk memutar'}</span></div>${Object.keys(e.parameters||{}).length?`<p class="hint">${Object.entries(e.parameters).map(([k,v])=>esc(k)+': '+esc(String(v))).join(' · ')}</p>`:''}${actions.length?`<div class="row-actions">${actions.map(x=>`<button type="button" class="primary-button" data-action="${esc(x.action)}">${esc(x.label)}</button>`).join('')}</div>`:''}${a?.movable===false?'':`<div class="row-actions"><button class="soft-button" data-operation="rotate-left">↶ Putar</button><button class="soft-button" data-operation="rotate-right">↷ Putar</button></div>`}${(a?.mechanisms||[]).length?`<div class="section-divider"></div><button class="primary-button" data-operation="detail-mode">${detailMode?'Selesai Detail':'🔍 Edit Detail · '+a.mechanisms.length+' bagian'}</button>${detailMode?a.mechanisms.map(m=>`<div class="mechanism-row"><span><strong>${esc(m.label)}</strong><small>${esc(m.kind)} · ${fmt(e.controls?.[m.id]??m.initial)} ${['hinge','dial'].includes(m.kind)?'°':'m'}</small></span><button class="soft-button" data-control-step="${esc(m.id)}" data-dir="-1" aria-label="Kurangi ${esc(m.label)}">−</button><button class="soft-button" data-control-step="${esc(m.id)}" data-dir="1" aria-label="Tambah ${esc(m.label)}">+</button></div>`).join(''):''}`:''}${(a?.affordances||[]).length?'':`<div class="row-actions"><button class="soft-button" data-operation="attach-doctor">Pegang dokter</button><button class="soft-button" data-operation="attach-patient">Pegang pasien</button></div>`}<div class="row-actions">${e.attachedTo?'<button class="soft-button" data-operation="detach">Lepas</button>':''}</div><div class="row-actions"><button type="button" class="soft-button" data-operation="duplicate">Duplikasi</button><button type="button" class="danger-button" data-operation="delete">Hapus</button></div>`;
 }
}
const navTitles={environments:['SAVED WORLDS','Environment dari GPT'],add:['ADD TO WORLD','Tambah objek'],ask:['AI BUILDER','Ask ChatGPT'],practice:['PRACTICE','Latihan OSCE'],more:['WORKSPACE','Pengaturan'],objects:['SCENE TREE','Semua objek'],advanced:['ADVANCED','Asset & Behavior'],diagnostics:['CONNECTION','Status & diagnostik']};
function renderPane(){if(!pane)return;
 if(!data){
   $('sheetEyebrow').textContent='KONEKSI';$('sheetTitle').textContent='Hubungkan studio';
   $('sheetBody').innerHTML=`<p>${hosted?'Sesi belum dimulai. Coba buka sesi baru.':'Sesi belum dimulai. Jika server memakai API_TOKEN, isi token untuk memulai sesi sementara.'}</p>${!embedded&&!hosted?`<label class="field"><span>Token server</span><input id="serverToken" type="password" autocomplete="off" placeholder="Bearer API_TOKEN"></label><button class="primary-button" data-ui="set-token">Hubungkan</button>`:''}<div class="row-actions"><button class="soft-button" data-ui="sync-now">Mulai sesi baru</button></div><p class="hint">${esc(lastError||'Server offline atau host ChatGPT belum tersedia.')}</p>`;
   return;
 }
 const [eyebrow,title]=navTitles[pane]||['STUDIO','Panel'];$('sheetEyebrow').textContent=eyebrow;$('sheetTitle').textContent=title;let html='';
 if(pane==='add'){
  html=`<p>Ketuk untuk menambahkan ke dunia. Objek langsung tampil dan dapat di-undo.</p><div class="seg-tabs"><button data-cat="all" class="${category==='all'?'active':''}">Semua</button><button data-cat="Furnitur" class="${category==='Furnitur'?'active':''}">Furnitur</button><button data-cat="Alat" class="${category==='Alat'?'active':''}">Alat</button></div>${category==='all'?`<h3>Karakter</h3><div class="asset-grid"><button class="asset-choice" data-spawn-character="doctor"><span class="asset-icon">${icon('hand')}</span><span><strong>Dokter</strong><small>Puppet mint</small></span></button><button class="asset-choice" data-spawn-character="patient"><span class="asset-icon peach">${icon('hand')}</span><span><strong>Pasien</strong><small>Puppet peach</small></span></button></div>`:''}<h3>Objek & instrumen</h3><div class="asset-grid">${data.assets.filter(a=>!a.legacyOnly&&(category==='all'||a.category===category)).map(a=>`<button class="asset-choice" data-spawn="${esc(a.id)}"><span class="asset-icon blue">${icon('box')}</span><span><strong>${esc(a.name)}</strong><small>${esc(a.category||'Custom')} · ${a.parts.length} bagian</small></span></button>`).join('')}</div>`;
 }
 if(pane==='ask'){
  html=`<p>${embedded&&!previewHost?'Beritahu ChatGPT apa yang ingin dibuat atau diubah. ChatGPT akan menggunakan tool MCP yang terhubung.':'Untuk situs mandiri, kirim instruksi melalui ChatGPT yang terhubung dengan plugin OSCE. Panel ini tidak berpura-pura menjadi chatbot.'}</p><label class="field"><span>Instruksi</span><textarea id="aiPrompt" rows="5" maxlength="3000" placeholder="Misalnya: buat ruangan pemeriksaan saraf, atur posisi pasien, dan siapkan alat...">${esc(window.__lastPrompt||'')}</textarea></label><div class="row-actions">${embedded&&!previewHost?'<button class="primary-button" data-ui="send-chat">Kirim ke ChatGPT</button>':'<button class="primary-button" data-ui="copy-chat">Salin instruksi</button><button class="soft-button" data-ui="open-chat">Buka ChatGPT</button>'}</div><p class="hint">Minta ChatGPT memakai create_environment agar dunia otomatis tersimpan, lalu load_environment untuk membukanya di tablet. Gerakan manual tetap sementara. Pembuatan geometri hanya mendukung kemampuan engine yang tersedia.</p>`;
 }
 if(pane==='practice'){
  const s=data.scene.scenario;const total=s.steps.length,done=s.completed?.length||0;
  html=`<p>Pilih kasus, lalu tandai tahap yang benar-benar sudah lu kerjakan. Sistem tidak memberikan skor teknik otomatis.</p><label class="field"><span>Skenario</span><select id="scenarioPicker">${data.templates.map(t=>`<option value="${esc(t.id)}" ${s.id===t.id?'selected':''}>${esc(t.name)}</option>`).join('')}${s.generated?`<option value="custom" selected>${esc(s.name)} (custom)</option>`:''}</select></label><div class="status-desc">${esc(s.patient?.complaint||'Latihan umum')} · ${done} / ${total} tahap selesai</div><h3>Checklist latihan</h3>${s.steps.map((step,i)=>`<label class="step"><input type="checkbox" data-step="${i}" ${(s.completed||[]).includes(i)?'checked':''}><span>${esc(step)}</span></label>`).join('')}<p class="hint">${esc(s.note||'')}</p>`;
 }
 if(pane==='more'){
  html=`<p>Gerakan saat latihan tetap sementara. Environment yang dibuat ChatGPT lewat MCP otomatis tersimpan dan bisa dibuka ulang.</p><div class="row-actions"><button class="soft-button" data-ui="redo">${icon('redo')} Redo</button><button class="soft-button" data-ui="reset-camera">${icon('focus')} Reset kamera</button></div><div class="section-divider"></div><div class="object-list"><button class="object-choice" data-open="environments">${icon('cloud')} <strong>Environment tersimpan</strong>${icon('arrow')}</button><button class="object-choice" data-open="objects">${icon('list')} <strong>Semua objek</strong>${icon('arrow')}</button><button class="object-choice" data-open="diagnostics">${icon('cloud')} <strong>Koneksi ChatGPT</strong>${icon('arrow')}</button><button class="object-choice" data-open="advanced">${icon('box')} <strong>AI Asset Builder (lanjutan)</strong>${icon('arrow')}</button></div><div class="section-divider"></div><div class="row-actions"><button class="danger-button" data-ui="reset-world">Reset dunia sekarang</button></div>`;
 }
 if(pane==='environments'){
  html=`<p>ChatGPT membuat dan menyimpan environment melalui MCP. Ketuk untuk membuka blueprint yang sudah tersimpan. Pose manual dari sesi sebelumnya tidak ikut disimpan.</p>${environmentFetchError?`<p class="hint error">${esc(environmentFetchError)}</p>`:''}<div class="object-list">${savedEnvironments.length?savedEnvironments.map(w=>`<button class="object-choice" data-load-environment="${esc(w.id)}">${icon('box')} <strong>${esc(w.name)}</strong><span class="tag">r${esc(w.revision)}</span>${icon('arrow')}</button>`).join(''):'<p class="hint">Belum ada environment tersimpan. Minta ChatGPT membuatnya dengan create_environment.</p>'}</div><div class="row-actions"><button class="soft-button" data-ui="refresh-environments">Muat ulang daftar</button><button class="soft-button" data-open="more">Kembali</button></div><p class="hint">Menghapus permanen dilakukan melalui tool MCP delete_environment dengan konfirmasi. Menghapus environment tidak menghapus sesi yang sedang terbuka.</p>`;
 }
 if(pane==='objects')html=`<p>Pilih objek dari daftar jika sulit disentuh karena tertutup objek lain.</p><div class="object-list">${data.scene.entities.map(e=>`<button class="object-choice ${e.id===selected?'active':''}" data-entity="${esc(e.id)}">${icon(e.type==='character'?'hand':'box')} <strong>${esc(e.name)}</strong><span class="tag">${esc(e.type==='character'?e.role:e.assetId)}</span></button>`).join('')}</div><div class="row-actions"><button class="soft-button" data-open="more">Kembali</button></div>`;
 if(pane==='diagnostics'){
  html=`<p>Perubahan ChatGPT pada environment tersimpan disimpan otomatis. Gerakan dari editor hanya berlaku pada sesi aktif.</p><div class="status-desc" id="diagSummary">Sesi: ${esc(sessionId||'Belum ada')} · ${esc(hostKind)}</div><div class="row-actions"><button class="soft-button" data-ui="check-mcp">Uji MCP</button><button class="soft-button" data-ui="load-log">Riwayat sesi</button></div><div id="recentLog"></div>${!embedded&&!hosted?`<label class="field"><span>Token server (jika diperlukan)</span><input type="password" id="serverToken" value="" autocomplete="off" placeholder="Bearer API_TOKEN"></label><div class="row-actions"><button class="soft-button" data-ui="set-token">Hubungkan sesi baru</button></div>`:''}<p class="hint">${hosted?'Menutup tab mengakhiri sesi bila permintaan penutupan terkirim. Sesi yang tertinggal kedaluwarsa setelah dua jam.':'Sesi dihapus dari memori server ketika permintaan penutupan diterima atau saat kedaluwarsa.'}</p>`;
 }
 if(pane==='advanced'){
  html=`<p>Untuk pengguna yang membutuhkan kendali penuh: definisi alat dan logika bekerja sungguhan setelah divalidasi server. Tidak ada eksekusi JavaScript buatan AI.</p><h3>Asset Factory</h3><label class="field"><span>Definisi aset JSON</span><textarea class="code" id="assetJSON" spellcheck="false">${esc(window.__assetDraft||JSON.stringify({id:'probe-custom',name:'Probe latihan',category:'Alat',parts:[{shape:'cylinder',position:[0,0,0],size:[.06,.32,.06],color:'#648bca'}],anchors:[{id:'grip',position:[0,0,0]}]},null,2))}</textarea></label><div class="row-actions"><button class="soft-button" data-ui="validate-asset">Periksa aset</button><button class="primary-button" data-ui="create-asset">Buat aset</button></div><h3>Behavior Engine</h3><label class="field"><span>Definisi status & transisi JSON</span><textarea class="code" id="behaviorJSON" spellcheck="false">${esc(window.__behaviorDraft||JSON.stringify({id:'switch-custom',name:'Saklar latihan',states:['off','on'],initial:'off',transitions:[{from:'off',action:'on',to:'on',label:'Aktifkan'},{from:'on',action:'off',to:'off',label:'Matikan'}]},null,2))}</textarea></label><div class="row-actions"><button class="soft-button" data-ui="validate-behavior">Periksa perilaku</button><button class="primary-button" data-ui="create-behavior">Buat perilaku</button></div><div class="row-actions"><button class="soft-button" data-open="more">Kembali</button></div>`;
 }
 $('sheetBody').innerHTML=html;
}
// The renderer and IK mutate the in-memory world immediately. Only a *finished*
// gesture produces an intent operation for the MCP session world. No per-frame
// requests. The editor explicitly keeps its changes in the active session.
async function updateScene(operations,{gesture=false,expectedSession}={}){
 if(expectedSession!==sessionId)return;
 if(!data)throw Error('Sesi belum dimulai');
 inFlight++;
 const baseRevision=data.scene.revision;
 try{
  const result=await tool('apply_scene_operations',{operations,baseRevision});
  if(expectedSession!==sessionId)return result;
  data.scene.revision=result.revision;
  const hasTriggeredMechanism=operations.some(op=>op.type==='set_mechanism'&&data.assets.find(a=>a.id===data.scene.entities.find(e=>e.id===op.entityId)?.assetId)?.mechanisms?.some(m=>m.id===op.mechanismId&&Object.keys(m.triggers||{}).length));
  if(!gesture||hasTriggeredMechanism||operations.some(op=>op.type==='rotate_entity')){await reload({force:true,quiet:true});}
  if(gesture)status('ok',data.environmentId?'Gerak sementara · GPT tersimpan':'Sesi sementara');
  clearError();return result;
 }catch(err){
  if(expectedSession!==sessionId)return;
  showError('Perubahan tidak diterima server',err.message+' · Perubahan di perangkat ditampilkan dahulu, lalu akan dipulihkan dari sesi server.');
  await reload({force:true,quiet:true}).catch(()=>{});
  throw err;
 }finally{inFlight--;if(expectedSession===sessionId&&remoteDirty&&!dragActive&&inFlight===0){remoteDirty=false;const needed=remoteRevision>(data?.scene?.revision||0);remoteRevision=0;if(needed)reload({force:true,quiet:true}).catch(()=>{});}}
}
function mutate(operations,options={}){const expectedSession=sessionId;const task=queue.then(()=>updateScene(operations,{...options,expectedSession}));queue=task.catch(()=>{});return task;}
async function reload({quiet=false,force=false}={}){
 if(refreshLock)return;
 if((inFlight>0||dragActive)&&!force){remoteDirty=true;return;}
 refreshLock=true;
 const expectedSession=sessionId;
 try{const latest=await tool('get_world_state');if(expectedSession!==sessionId)return;if(!dragActive){applyData(latest);if(frameReady)hideLoading();}else remoteDirty=true;if(!quiet)clearError();}
 catch(err){if(!quiet){showError('Sesi belum tersedia',err.message);if(!data)loadingFailure(err.message);}throw err;}
 finally{refreshLock=false;}
}
async function performTool(name,args={},success){inFlight++;try{
 const result=await tool(name,args);
 if(!['get_execution_log','validate_asset','validate_behavior','test_behavior'].includes(name))await reload({force:true,quiet:true});
 if(success)notice(success);status('ok',data?.environmentId?'Blueprint GPT tersimpan':'Sesi sementara');return result;
 }catch(err){showError('Operasi gagal',err.message);throw err;}finally{inFlight--;}}
function listenSessionEvents(){
 if(embedded||!sessionId||eventAbort)return;
 const controller=new AbortController();eventAbort=controller;const activeSession=sessionId;
 (async()=>{
  let retry=0;
  while(!controller.signal.aborted&&sessionId===activeSession){
   try{
    const path=hosted?'/api/events?since='+encodeURIComponent(data?.scene.revision??0):'/api/events';
    const response=await fetch(path,{headers:apiHeaders(),signal:controller.signal});
    if(response.status===410){showError('Sesi berakhir','Buka sesi baru untuk melanjutkan.');status('error','Sesi berakhir');break;}
    if(!response.ok||!response.body)throw Error('Aliran perubahan ChatGPT tidak tersedia');
    if(retry){retry=0;await reload({quiet:true}).catch(()=>{});notice('Koneksi perubahan ChatGPT pulih');}
    const reader=response.body.getReader(),decoder=new TextDecoder();let chunk='';
    while(!controller.signal.aborted){
     const {value,done}=await reader.read();if(done)break;chunk+=decoder.decode(value,{stream:true});
     const blocks=chunk.split('\n\n');chunk=blocks.pop()||'';
     for(const block of blocks){
      if(block.includes('event: session_expired')){showError('Sesi berakhir','Buka sesi baru untuk melanjutkan.');status('error','Sesi berakhir');controller.abort();break;}
      if(!block.includes('event: scene_updated'))continue;
      const line=block.split('\n').find(x=>x.startsWith('data: '));if(!line)continue;
      let evt;try{evt=JSON.parse(line.slice(6))}catch{continue}
      if(evt.revision>(data?.scene?.revision||0)){
       if(dragActive||inFlight>0){remoteDirty=true;remoteRevision=Math.max(remoteRevision,evt.revision);}
       else await reload({quiet:true});
      }
     }
    }
    if(!controller.signal.aborted&&!hosted)throw Error('Aliran perubahan terputus');
   }catch(err){
    if(controller.signal.aborted)break;
    if(!retry&&data)notice('Koneksi perubahan ChatGPT terputus; mencoba ulang',true);
    retry++;
    await new Promise(resolve=>setTimeout(resolve,Math.min(1200*2**Math.min(retry,4),12000)));
   }
  }
 })();
}
async function startFreshSession({useHostResult=false}={}){
 eventAbort?.abort();eventAbort=null;
 sessionId=null;remoteDirty=false;remoteRevision=0;
 if(embedded&&!previewHost){
   await initializeBridge();
   let initial=useHostResult ? window.openai?.toolOutput || initialWidgetState : null;
   if(useHostResult&&!initial&&hostKind==='mcp-app'){
     initial=await new Promise(resolve=>{
       const timer=setTimeout(()=>{receiveInitial=null;resolve(null);},1200);
       receiveInitial=value=>{clearTimeout(timer);receiveInitial=null;resolve(value);};
     });
   }
   const state=(initial?.sessionId&&initial?.scene) ? initial : await tool('open_studio');
   applyData(state);
   return;
 }
 const start=await api('/api/session','POST',{});applyData(start);listenSessionEvents();
}
function safeID(prefix){return prefix+'-'+(globalThis.crypto?.randomUUID?.().slice(0,8)||Math.random().toString(36).slice(2,10));}
function spawnPosition(furniture){const offset=(data?.scene.entities.length||0)%6;return furniture?[0.7+offset*.22,0,-.7+offset*.21]:[0.35+offset*.19,.82,.4+offset*.14];}
async function execute(kind,payload){const e=currentEntity();try{
 switch(kind){
  case 'spawn-character':{const role=payload;const id=safeID('human');await mutate([{type:'spawn_character',id,role,name:role==='doctor'?'Dokter baru':'Pasien baru',position:role==='doctor'?[-1.7,0,1.3]:[1.1,0,1.3]}]);choose(id);stopPane();notice('Boneka ditambahkan');break;}
  case 'spawn-asset':{const a=data.assets.find(x=>x.id===payload);if(!a)throw Error('Aset tidak ada dalam katalog');const id=safeID('object');await mutate([{type:'spawn_asset',id,assetId:a.id,position:spawnPosition(a.category==='Furnitur')}]);choose(id);stopPane();notice(a.name+' ditambahkan');break;}
  case 'pose-standing':case 'pose-sitting':if(e)await mutate([{type:'apply_pose',entityId:e.id,presetId:kind.replace('pose-','')}]);break;
  case 'detail-mode':{if(e?.type==='asset'&&blueprint(e)?.mechanisms?.length){detailMode=!detailMode;renderer.setDetailMode(detailMode);$('detailHud').hidden=!detailMode;if(detailMode)renderer.focusDetail(e.id);renderSelection();}break;}
  case 'rotate-left':case 'rotate-right':if(e){const step=kind==='rotate-left'?-Math.PI/6:Math.PI/6;await mutate([{type:'rotate_entity',entityId:e.id,rotation:[e.rotation?.[0]||0,Math.atan2(Math.sin((e.rotation?.[1]||0)+step),Math.cos((e.rotation?.[1]||0)+step)),e.rotation?.[2]||0]}]);}break;
  case 'attach-doctor':case 'attach-patient':if(e)await mutate([{type:'attach',entityId:e.id,targetId:kind.replace('attach-',''),anchor:'rightHand'}]);break;
  case 'detach':if(e)await mutate([{type:'detach',entityId:e.id}]);break;
  case 'duplicate':if(e?.type==='asset'){const id=safeID('copy');await mutate([{type:'spawn_asset',id,assetId:e.assetId,position:[e.position[0]+.25,e.position[1],e.position[2]+.25],rotation:e.rotation}]);choose(id);}break;
  case 'delete':if(e&&confirm('Hapus '+e.name+' dari scene?')){await mutate([{type:'delete_entity',entityId:e.id}]);choose(null);}break;
    case 'undo':await performTool('undo_scene',{},'Undo selesai');break;
  case 'redo':await performTool('redo_scene',{},'Redo selesai');break;
  case 'reset-camera':renderer.resetCamera();notice('Kamera kembali ke posisi awal');break;
      case 'reset-world':if(confirm('Mulai sesi kosong dari awal? Semua perubahan sesi ini akan hilang.')){eventAbort?.abort();eventAbort=null;if(embedded){sessionId=null;await startFreshSession();}else{if(sessionId)await fetch('/api/session',{method:'DELETE',headers:apiHeaders()}).catch(()=>{});sessionId=null;await startFreshSession();}choose(null);stopPane();notice('Sesi baru dimulai');}break;
  case 'check-mcp':{
    const summary=$('diagSummary');
    if(embedded&&!previewHost){
      const world=await tool('get_world_state');
      if(summary)summary.textContent=`Host ${hostKind} terhubung · revisi ${world.scene.revision}.`;
    }else{
      const count=hosted?(await api('/api/connection')).toolCount:(await api('/mcp','POST',{jsonrpc:'2.0',id:1,method:'tools/list',params:{}})).result?.tools?.length;
      if(!count)throw Error('Katalog MCP tidak tersedia');
      if(summary)summary.textContent=`Server MCP menyediakan ${count} tool.`;
    }
    notice('Pemeriksaan MCP berhasil');break;
  }
  case 'refresh-environments':await refreshEnvironments();notice('Daftar environment diperbarui');break;
  case 'sync-now':await startFreshSession();notice('Sesi baru dimulai');break;
  case 'set-token':session.setItem('osce-studio-token',$('serverToken').value.trim());eventAbort?.abort();eventAbort=null;sessionId=null;await startFreshSession();if(data)stopPane();notice('Sesi baru terhubung');break;
  case 'load-log':{const logs=await tool('get_execution_log');const array=Array.isArray(logs)?logs:logs.result||[];const holder=$('recentLog');if(holder)holder.innerHTML=array.slice(0,12).map(l=>`<div class="status-desc">${esc(l.label)} · r${esc(l.revision)}<br><span class="meta">${esc(l.at)}</span></div>`).join('')||'<p>Belum ada riwayat.</p>';break;}
  case 'validate-asset':case 'create-asset':{const raw=$('assetJSON').value;window.__assetDraft=raw;const a=JSON.parse(raw);const r=await performTool(kind==='create-asset'?'create_asset':'validate_asset',kind==='create-asset'?a:{asset:a});notice(kind==='create-asset'?'Aset baru siap dipakai di sesi ini':'Aset valid: '+r.partCount+' bagian');break;}
  case 'validate-behavior':case 'create-behavior':{const raw=$('behaviorJSON').value;window.__behaviorDraft=raw;const b=JSON.parse(raw);const r=await performTool(kind==='create-behavior'?'create_behavior':'validate_behavior',kind==='create-behavior'?b:{behavior:b});notice(kind==='create-behavior'?'Perilaku siap di sesi ini':'Perilaku valid: '+r.transitionCount+' transisi');break;}
  case 'send-chat':case 'copy-chat':case 'open-chat':{
    const prompt=$('aiPrompt')?.value.trim()||'';if(!prompt)throw Error('Tulis instruksi terlebih dahulu');window.__lastPrompt=prompt;
    const full=prompt+'\n\n'+DEFAULT_COMMAND+'\n\nSesi aktif: '+(sessionId||'belum tersedia')+'. Untuk mengedit scene yang sama, sertakan sessionId pada setiap tool MCP.';
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
 onPreviewMechanism(id,m,value){if(selected===id){$('detailValue').textContent=`${m.label}: ${fmt(value)} ${['hinge','dial'].includes(m.kind)?'°':'m'}`;$('interactionHint').textContent='Bagian '+m.label+' · lepaskan untuk menetapkan';}},
 onPreviewRotation(id,rotation){if(selected===id){$('selectionKicker').textContent='PUTAR OBJEK · '+Math.round(rotation[1]*180/Math.PI)+'°';$('interactionHint').textContent='Tarik pegangan ⟳ untuk memutar secara langsung';}},
 onPreviewPose(id,joint,pose,g){if(selected===id){const title=$('selectionKicker');if(title)title.textContent='MENGATUR POSE · '+friendlyJoint(joint);if(g?.reachLimit||g?.ikError>.12)$('interactionHint').textContent='Batas jangkauan sendi · tarik target lebih dekat';}},
 onPreviewPosition(id,p,g){if(selected===id){const title=$('selectionKicker');if(title)title.textContent='MEMINDAHKAN · '+p.map(fmt).join(' / ');if(g?.snap)$('interactionHint').textContent='Lepas untuk menaruh alat di '+g.snap.supportName;if(g?.characterSnap)$('interactionHint').textContent=g.characterSnap.kind==='bed'?'Lepas untuk membaringkan pasien di '+g.characterSnap.supportName:'Lepas untuk mendudukkan pasien di '+g.characterSnap.supportName;
  if(data.scene.entities.some(e=>e.supportedBy?.entityId===id||e.restingOn?.entityId===id))$('interactionHint').textContent='Geser furnitur · pasien dan alat di atasnya ikut bergerak';}},
 onGesture(phase,hit){if(phase==='start'){if(hit){selectionExpanded=false;renderSelection();}dragActive=!!hit;document.body.classList.toggle('puppet-dragging',!!hit);const attached=hit&&data?.scene?.entities.find(e=>e.id===hit.entityId)?.attachedTo;$('interactionHint').textContent=attached?'Objek terpasang · buka tindakan objek untuk melepas':hit?.kind==='pose'?'Tarik tangan/kaki · Lepas untuk membekukan':hit?'Geser objek · Lepas untuk menyimpan':'Geser ruang kosong untuk memutar kamera';}
  if(phase==='rotate'){$('interactionHint').textContent='Memutar objek · lepas untuk menetapkan arah';dragActive=true;}
  if(phase==='camera'){$('interactionHint').textContent='Pose tetap · dua jari untuk zoom dan geser kamera';dragActive=true;}
  if(phase==='end'||phase==='cancel'){dragActive=false;setTimeout(()=>{if(remoteDirty&&!dragActive&&!inFlight&&remoteRevision>(data?.scene?.revision||0)){remoteDirty=false;remoteRevision=0;reload({quiet:true}).catch(()=>{});}},80);document.body.classList.remove('puppet-dragging');$('interactionHint').textContent='Tarik tubuh, tangan, atau kaki · Cubit untuk zoom';if(selected)renderSelection();}},
 onCommitOperations(operations){
  const pose=operations.find(o=>o.type==='place_character');
  const asset=operations.find(o=>o.type==='place_asset');
  const label=pose?(data?.assets.find(a=>a.id===data?.scene.entities.find(e=>e.id===pose.supportId)?.assetId)?.affordances?.find(a=>a.id===pose.affordanceId)?.kind==='bed'?'Pasien berbaring':'Pasien duduk'):asset?'Alat diletakkan di permukaan':null;
  mutate(operations,{gesture:true}).then(()=>{if(label)notice(label);}).catch(()=>{});
 }

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
$('errorDismiss').addEventListener('click',clearError);
$('retryLoad').addEventListener('click',()=>{showLoading('Mencoba membuat sesi baru…');startFreshSession().catch(err=>loadingFailure(err.message));});
$('sheetBody').addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.open){openPane(b.dataset.open);return;}
 if(b.dataset.loadEnvironment){try{const id=b.dataset.loadEnvironment;const loaded=embedded?await tool('load_environment',{environmentId:id}):await api('/api/environments/'+encodeURIComponent(id)+'/open','POST',{});applyData(loaded);choose(null);stopPane();notice('Environment dimuat. Gerakan manual tetap sementara.');}catch(e){showError('Gagal membuka environment',e.message);}return;}
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
$('detailClose').addEventListener('click',()=>{detailMode=false;renderer.setDetailMode(false);$('detailHud').hidden=true;renderSelection();});
$('selectionBody').addEventListener('click',async event=>{
 const b=event.target.closest('button');if(!b)return;
 if(b.dataset.controlStep&&currentEntity()?.type==='asset'){
   const e=currentEntity(),m=blueprint(e)?.mechanisms?.find(x=>x.id===b.dataset.controlStep);
   if(m){const current=e.controls?.[m.id]??m.initial,unit=m.kind==='button'?m.max:(m.kind==='slider'?0.01:5);
     const v=m.kind==='button'?(current===m.max?m.min:m.max):Math.min(m.max,Math.max(m.min,current+unit*Number(b.dataset.dir)));
     if(v!==current)await mutate([{type:'set_mechanism',entityId:e.id,mechanismId:m.id,value:v}]).catch(()=>{});
   }return;
 }
 if(b.dataset.action&&currentEntity())await mutate([{type:'trigger_action',entityId:selected,action:b.dataset.action}]).catch(()=>{});
 if(b.dataset.operation)await execute(b.dataset.operation);
});
document.addEventListener('keydown',event=>{const inField=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);if(event.key==='Escape'){if(pane)stopPane();else choose(null);}if(!inField&&(event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='z'){event.preventDefault();execute(event.shiftKey?'redo':'undo');}});
window.addEventListener('online',()=>{if(remoteDirty)reload({quiet:true}).catch(()=>{});});
window.addEventListener('unhandledrejection',event=>{showError('Proses gagal',event.reason?.message||'Permintaan tidak selesai.');});

async function boot(){
 showLoading('Menyiapkan dunia sementara…');
 try{await startFreshSession({useHostResult:true});if(frameReady)hideLoading();}
 catch(err){if(!data)loadingFailure(err.message);showError('Studio belum terhubung',err.message);}
}
boot();
// Best-effort deletion. A crashed tab may leave RAM behind until TTL eviction;
// no scene survives a new visit because a new session ID is always generated.
// Back/forward cache can resurrect a page after pagehide despite the deleted session.
// A restored document must always create a fresh world.
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
window.addEventListener('pagehide',()=>{
 if(sessionClosed||embedded||!sessionId)return;sessionClosed=true;
 eventAbort?.abort();
 fetch('/api/session',{method:'DELETE',headers:apiHeaders(),keepalive:true}).catch(()=>{});
});

if(!hosted && !embedded && 'serviceWorker' in navigator && (location.protocol==='https:' || ['127.0.0.1','localhost'].includes(location.hostname))){
 window.addEventListener('load',()=>navigator.serviceWorker.register('/sw.js').catch(error=>{console.warn('PWA cache unavailable:',error.message)}));
}
