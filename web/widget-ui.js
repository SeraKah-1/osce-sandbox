// MCP Apps UI for ChatGPT. Bundled inline with render3d.js by server/widget.js.
// Uses the ChatGPT MCP Apps bridge, or authenticated same-origin API in local preview.
const qs = id => document.getElementById(id);
const escapeText = value => String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
let world = null, selectedId = 'patient', joint = 'rightShoulder', axis = 'abduction';
let activeTab = 'scene', busy = false, token = '';
let statusTimeout;
const canvas = qs('scene3d'), overlay = qs('hotspots');
const renderer = createRenderer(canvas,overlay,{
  onSelect(id, j){if(id){selectedId=id;if(j)joint=j;}renderInspector();renderEntityList();},
  onCommitJoint: async(id,j,a,v)=>{await operate([{type:'set_joint',entityId:id,joint:j,axis:a,angle:v}]);},
  onCommitPosition: async(id,position)=>{await operate([{type:'move_entity',entityId:id,position}]);},
});
renderer.setMode('pose');
function notify(message,error=false){const p=qs('notice');p.textContent=message;p.dataset.error=error?'true':'false';p.hidden=false;clearTimeout(statusTimeout);statusTimeout=setTimeout(()=>p.hidden=true,4200);}
function extract(response){
  if(response?.isError){const t=response.content?.find(x=>x.type==='text')?.text;throw Error(t||'Tool gagal');}
  if(response?.structuredContent)return response.structuredContent;
  const t=response?.content?.find(x=>x.type==='text')?.text;
  if(t){try{return JSON.parse(t);}catch{return {result:t};}}
  return response?.result ?? response;
}
const framed=window.parent!==window;
let hostReady;
function connectHost() {
  let sequence=0;
  let targetOrigin='*';
  const pending=new Map();
  const send=message=>window.parent.postMessage({jsonrpc:'2.0',...message},targetOrigin);
  const request=(method,params,timeout=15000)=>new Promise((resolve,reject)=>{
    const id=++sequence;
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('Koneksi ChatGPT tidak merespons.'));},timeout);
    pending.set(id,{resolve,reject,timer});
    send({id,method,params});
  });
  const handleMessage=event=>{
    if(event.source!==window.parent || (targetOrigin!=='*' && event.origin!==targetOrigin))return;
    const msg=event.data;
    if(msg?.jsonrpc!=='2.0')return;
    if(msg.method==='ui/notifications/tool-result'){
      if(msg.params?.structuredContent?.scene) displayWorld(msg.params.structuredContent);
      return;
    }
    if(msg.method==='ui/resource-teardown' && msg.id!==undefined){send({id:msg.id,result:{}});return;}
    if(msg.method==='ping' && msg.id!==undefined){send({id:msg.id,result:{}});return;}
    if(!msg.method && pending.has(msg.id)){
      const job=pending.get(msg.id);pending.delete(msg.id);clearTimeout(job.timer);
      if(msg.error)job.reject(Error(msg.error.message));
      else {
        if(msg.id===1 && event.origin!=='null')targetOrigin=event.origin;
        job.resolve(msg.result);
      }
    }
  };
  window.addEventListener('message',handleMessage);
  return request('ui/initialize',{
    appInfo:{name:'OSCE Sandbox Studio',version:'0.2.0'},
    appCapabilities:{},
    protocolVersion:'2026-01-26',
  },5000).then(()=>{
    send({method:'ui/notifications/initialized'});
    return request;
  },error=>{
    window.removeEventListener('message',handleMessage);
    throw error;
  });
}
async function callTool(name,args={}){
  if(window.openai?.callTool){return extract(await window.openai.callTool(name,args));}
  if(framed){
    hostReady??=connectHost().catch(error=>{hostReady=null;throw error;});
    const request=await hostReady;
    return extract(await request('tools/call',{name,arguments:args}));
  }
  const headers={'Content-Type':'application/json'};
  if(token)headers.Authorization='Bearer '+token;
  if(name==='get_world_state'){
    const r=await fetch('/api/state',{headers});const out=await r.json();if(!r.ok)throw Error(out.error||'API unavailable');return out;
  }
  if(name==='get_asset_catalog'){const w=await callTool('get_world_state');return {assets:w.assets,behaviors:w.behaviors};}
  let endpoint,method='POST',payload=args;
  if(name==='apply_scene_operations'){endpoint='/api/operations';}
  else if(name==='create_asset'){endpoint='/api/assets';}
  else if(name==='create_behavior'){endpoint='/api/behaviors';}
  else if(name==='test_behavior'){endpoint='/api/behavior-test';}
  else {throw Error('ChatGPT bridge tidak tersedia. Buka panel koneksi untuk pratinjau lokal.');}
  const r=await fetch(endpoint,{method,headers,body:JSON.stringify(payload)});
  const out=await r.json();if(!r.ok)throw Error(out.error||'API error');return out;
}
function displayWorld(next){
  if(world && next.scene.revision<=world.scene.revision)return;
  world=next;
  renderer.setWorld(world);renderEntityList();renderInspector();renderAssets();renderScenario();
  qs('revision').textContent='REV '+world.scene.revision;
  qs('title').textContent=world.scene.title;
  qs('connection').textContent='TERHUBUNG';
}
async function refresh(silent=false){
  try{
    const next=await callTool('get_world_state');
    if(!next?.scene?.entities)throw Error('Format scene invalid');
    displayWorld(next);
    qs('connection').textContent='TERHUBUNG';
  }catch(err){qs('connection').textContent='OFFLINE';if(!silent)notify(err.message,true);}
}
async function operate(operations){if(!world)throw Error('Scene belum tersedia');try{busy=true;const result=await callTool('apply_scene_operations',{baseRevision:world.scene.revision,operations});
    if(result.ok===false)throw Error(result.error||'Operasi gagal');await refresh(true);return result;
  }catch(err){notify(err.message,true);await refresh(true);throw err;}finally{busy=false;}}
function choose(id){selectedId=id;renderer.setSelected(id);renderEntityList();renderInspector();}
function selected(){return world?.scene.entities.find(x=>x.id===selectedId);}
function renderEntityList(){const holder=qs('entities');if(!world)return;
  holder.innerHTML=world.scene.entities.map(e=>`<button type="button" data-entity="${escapeText(e.id)}" class="entity ${e.id===selectedId?'chosen':''}">${e.type==='character'?'◉':'▣'} ${escapeText(e.name)}<span>${escapeText(e.id)}</span></button>`).join('');}
function renderAssets(){if(!world)return;qs('assetSelect').innerHTML=world.assets.map(a=>`<option value="${escapeText(a.id)}">${escapeText(a.name)}${a.custom?' ✦':''}</option>`).join('');}
function renderScenario(){if(!world)return;const s=world.scene.scenario;qs('scenarioTitle').textContent=s.name;qs('scenarioNote').textContent=s.note||'';qs('steps').innerHTML=s.steps.map((name,i)=>`<label class="step"><input type="checkbox" data-step="${i}" ${(s.completed||[]).includes(i)?'checked':''}><span>${escapeText(name)}</span></label>`).join('');}
function renderInspector(){const el=qs('inspector');const e=selected();if(!e){el.innerHTML='<p>Pilih objek di scene.</p>';return;}
  if(e.type==='character'){
    const names=Object.keys(e.pose),j=e.pose[joint]?joint:names[0];joint=j;const axes=Object.keys(e.pose[j]);if(!axes.includes(axis))axis=axes[0];renderer.setAxis(axis);
    el.innerHTML=`<div class="inspector-head"><strong>${escapeText(e.name)}</strong><span>Sendi</span></div><div class="inline"><select id="jointSelect">${names.map(n=>`<option value="${escapeText(n)}" ${n===joint?'selected':''}>${escapeText(n)}</option>`).join('')}</select><select id="axisSelect">${axes.map(a=>`<option ${a===axis?'selected':''} value="${escapeText(a)}">${escapeText(a)}</option>`).join('')}</select></div><label class="range-label">Sudut <output id="angle">${e.pose[j][axis]}°</output></label><input id="angleRange" type="range" min="-180" max="180" value="${e.pose[j][axis]}" step="1"><div class="inline"><button data-pose="standing">Berdiri</button><button data-pose="sitting">Duduk</button><button data-pose="raised-arm">Angkat tangan</button></div><p class="hint">Drag titik sendi di 3D atau atur slider. Pose disimpan di server.</p>`;
  }else{
    const blueprint=world.assets.find(a=>a.id===e.assetId),behavior=world.behaviors.find(b=>b.id===blueprint?.behaviorId);
    const actions=(behavior?.transitions||[]).filter(t=>t.from===(e.status??behavior?.initial));
    el.innerHTML=`<div class="inspector-head"><strong>${escapeText(e.name)}</strong><span>${escapeText(e.status||'Objek')}</span></div><p class="hint">XYZ: ${e.position.map(v=>Number(v).toFixed(2)).join(' / ')}</p><div class="inline">${actions.map(t=>`<button data-action="${escapeText(t.action)}">${escapeText(t.label)}</button>`).join('')||'<span class="hint">Tidak ada tindakan aktif</span>'}</div><div class="inline"><button data-attach="doctor">Pegang dokter</button><button data-attach="patient">Pegang pasien</button><button data-detach="true">Lepas</button></div><div class="inline"><button data-shift="-0.15">← Geser</button><button data-shift="0.15">Geser →</button><button data-delete="true">Hapus</button></div>`;
  }
}
function changeTab(tab){activeTab=tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('[data-section]').forEach(x=>x.hidden=x.dataset.section!==tab);}
qs('tabs').addEventListener('click',e=>{const btn=e.target.closest('[data-tab]');if(btn)changeTab(btn.dataset.tab);});
qs('entities').addEventListener('click',e=>{const b=e.target.closest('[data-entity]');if(b)choose(b.dataset.entity);});
qs('inspector').addEventListener('change',async e=>{
  if(e.target.id==='jointSelect'){joint=e.target.value;renderInspector();}
  if(e.target.id==='axisSelect'){axis=e.target.value;renderInspector();}
  if(e.target.id==='angleRange'&&selected())await operate([{type:'set_joint',entityId:selectedId,joint,axis,angle:Number(e.target.value)}]);
});
qs('inspector').addEventListener('input',e=>{if(e.target.id==='angleRange'){qs('angle').textContent=e.target.value+'°';const ent=selected();if(ent?.pose[joint])ent.pose[joint][axis]=Number(e.target.value);}});
qs('inspector').addEventListener('click',async ev=>{const b=ev.target.closest('button');if(!b||!selected()||busy)return;
 try{
  if(b.dataset.pose)await operate([{type:'apply_pose',entityId:selectedId,presetId:b.dataset.pose}]);
  if(b.dataset.action)await operate([{type:'trigger_action',entityId:selectedId,action:b.dataset.action}]);
  if(b.dataset.attach)await operate([{type:'attach',entityId:selectedId,targetId:b.dataset.attach,anchor:'rightHand'}]);
  if(b.dataset.detach)await operate([{type:'detach',entityId:selectedId}]);
  if(b.dataset.shift){const old=selected().position;await operate([{type:'move_entity',entityId:selectedId,position:[old[0]+Number(b.dataset.shift),old[1],old[2]]}]);}
  if(b.dataset.delete&&confirm('Hapus objek dari scene?'))await operate([{type:'delete_entity',entityId:selectedId}]);
 }catch{/* error reported by operate */}
});
qs('addAsset').addEventListener('click',async()=>{try{const id=qs('assetSelect').value;if(!id)return;const asset=world.assets.find(a=>a.id===id);
 await operate([{type:'spawn_asset',assetId:id,position:asset?.category==='Furnitur'?[1.2,0,.4]:[0,.9,.5]}]);notify('Alat masuk ke scene');
 }catch(err){notify(err.message,true);}});
qs('addDoctor').addEventListener('click',async()=>{try{await operate([{type:'spawn_character',role:'doctor',name:'Dokter Tambahan',position:[-1.5,0,1]}]);}catch{}});
qs('addPatient').addEventListener('click',async()=>{try{await operate([{type:'spawn_character',role:'patient',name:'Pasien Tambahan',position:[1,0,1]}]);}catch{}});
qs('steps').addEventListener('change',async ev=>{const checkbox=ev.target.closest('[data-step]');if(!checkbox)return;try{await operate([{type:checkbox.checked?'complete_step':'uncomplete_step',index:Number(checkbox.dataset.step)}]);}catch{}});
qs('createAsset').addEventListener('click',async()=>{try{const asset=JSON.parse(qs('assetJSON').value);const res=await callTool('create_asset',asset);if(!res.ok)throw Error(res.error||'Aset gagal dibuat');await refresh();changeTab('asset');notify('Aset baru siap dipakai');}catch(err){notify(err.message,true);}});
qs('createBehavior').addEventListener('click',async()=>{try{const behavior=JSON.parse(qs('behaviorJSON').value);const res=await callTool('create_behavior',behavior);if(!res.ok)throw Error(res.error||'Behavior gagal dibuat');await refresh();notify('Logika alat tersimpan');}catch(err){notify(err.message,true);}});
qs('cameraReset').addEventListener('click',()=>renderer.resetCamera());
qs('modeSelect').addEventListener('click',()=>{renderer.setMode('select');qs('modeSelect').classList.add('active');qs('modeMove').classList.remove('active');});
qs('modeMove').addEventListener('click',()=>{renderer.setMode('move');qs('modeMove').classList.add('active');qs('modeSelect').classList.remove('active');});
qs('refresh').addEventListener('click',()=>refresh());
qs('saveToken').addEventListener('click',()=>{token=qs('previewToken').value.trim();refresh();});
qs('connectionPanel').hidden=framed || Boolean(window.openai?.callTool);
// A simple built-in example is editable, not a fake instrument.
qs('behaviorJSON').value=JSON.stringify({id:'button-control',name:'Two-position control',states:['off','on'],initial:'off',transitions:[{from:'off',action:'switch_on',to:'on',label:'Nyalakan'},{from:'on',action:'switch_off',to:'off',label:'Matikan'}]},null,2);
qs('assetJSON').value=JSON.stringify({id:'custom-probe',name:'Probe latihan',category:'Alat',parts:[{shape:'cylinder',position:[0,0,0],size:[0.05,0.3,0.05],color:'#3b82a5'},{shape:'sphere',position:[0,0.16,0],size:[0.08,0.05,0.08],color:'#d1e5eb'}],anchors:[{id:'grip',position:[0,0,0]}]},null,2);
// ChatGPT host initializes widget asynchronously; do not assume immediate globals.
if(window.openai?.toolOutput?.scene)displayWorld(window.openai.toolOutput);
refresh();
setInterval(()=>{if(!document.hidden&&!busy)refresh(true);},6000);
