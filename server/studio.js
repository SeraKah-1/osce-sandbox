export class SceneError extends Error {
  constructor(message, code='VALIDATION_ERROR', status=400) { super(message); this.code=code; this.status=status; }
}
export const copy = x => structuredClone(x);
export const uid = prefix => `${prefix}-${crypto.randomUUID().slice(0,8)}`;
const finite = x => typeof x==='number' && Number.isFinite(x);
const cleanId = s => typeof s==='string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,75}$/.test(s);
const vector = (v,limit=100) => Array.isArray(v) && v.length===3 && v.every(x=>finite(x)&&Math.abs(x)<=limit);
const color = s => typeof s==='string' && /^#[0-9a-fA-F]{6}$/.test(s);
const fail = (msg,code='VALIDATION_ERROR') => {throw new SceneError(msg,code)};
const CHARACTER_ANCHORS=new Set(['head','neck','chest','spine','hip','rightHand','leftHand','rightWrist','leftWrist','rightElbow','leftElbow','rightShoulder','leftShoulder','rightUpperArm','leftUpperArm','rightForearm','leftForearm','rightHip','leftHip','rightKnee','leftKnee','rightAnkle','leftAnkle']);
function requireAnchor(target,anchor,assets){
  if(!cleanId(anchor))fail('Anchor harus berisi ID yang valid');
  if(target.type==='character'&&!CHARACTER_ANCHORS.has(anchor))fail(`Anchor karakter '${anchor}' tidak tersedia`,'NOT_FOUND');
  if(target.type==='asset'){
    const def=assets.find(a=>a.id===target.assetId);
    if(!def?.anchors?.some(a=>a.id===anchor))fail(`Anchor objek '${anchor}' tidak tersedia`,'NOT_FOUND');
  }
}

const builtInAssets = [
  {id:'bed',name:'Bed Pemeriksaan',category:'Furnitur',parts:[{shape:'box',position:[0,.46,0],size:[1.9,.18,.78],color:'#8fa8b8'},{shape:'box',position:[-.78,.28,0],size:[.08,.44,.72],color:'#657d8e'},{shape:'box',position:[.79,.28,0],size:[.08,.44,.72],color:'#657d8e'},{shape:'box',position:[0,.57,0],size:[1.83,.065,.74],color:'#d3e5eb'}],anchors:[{id:'surface',position:[0,.63,0]}]},
  {id:'chair',name:'Kursi Pasien',category:'Furnitur',parts:[{shape:'box',position:[0,.45,0],size:[.55,.09,.55],color:'#759fb0'},{shape:'box',position:[0,.76,-.25],size:[.55,.65,.08],color:'#759fb0'},{shape:'box',position:[-.22,.22,0],size:[.07,.45,.07],color:'#536c7b'},{shape:'box',position:[.22,.22,0],size:[.07,.45,.07],color:'#536c7b'}],anchors:[{id:'seat',position:[0,.52,0]}]},
  {id:'table',name:'Meja Instrumen',category:'Furnitur',parts:[{shape:'box',position:[0,.7,0],size:[.9,.07,.55],color:'#8eacb3'},{shape:'box',position:[-.35,.36,-.19],size:[.06,.68,.06],color:'#617b84'},{shape:'box',position:[.35,.36,.19],size:[.06,.68,.06],color:'#617b84'}],anchors:[{id:'top',position:[0,.77,0]}]},
  {id:'stethoscope',name:'Stetoskop',category:'Alat',parts:[{shape:'cylinder',position:[0,.14,0],size:[.065,.28,.065],color:'#3186aa'},{shape:'sphere',position:[0,-.06,0],size:[.12,.035,.12],color:'#bdcbd3'},{shape:'sphere',position:[0,.29,0],size:[.065,.055,.06],color:'#dbe4ea'}],anchors:[{id:'grip',position:[0,.18,0]}],behaviorId:'attach-basic'},
  {id:'cuff',name:'Manset Tensimeter',category:'Alat',parts:[{shape:'box',position:[0,0,0],size:[.32,.16,.17],color:'#317fa9'},{shape:'box',position:[.24,-.02,0],size:[.15,.08,.13],color:'#425c72'}],anchors:[{id:'grip',position:[0,0,0]}],behaviorId:'cuff-behavior'},
  {id:'goniometer',name:'Goniometer',category:'Alat',parts:[{shape:'box',position:[-.18,0,0],size:[.40,.018,.035],color:'#e2bb6d'},{shape:'box',position:[.13,0,.13],size:[.035,.018,.37],color:'#dfac55'},{shape:'sphere',position:[0,.01,0],size:[.045,.02,.045],color:'#c48d3a'}],anchors:[{id:'pivot',position:[0,0,0]}]},
  {id:'tourniquet',name:'Tourniquet Latihan',category:'Alat',parts:[{shape:'box',position:[0,0,0],size:[.48,.05,.10],color:'#4d9dc0'},{shape:'box',position:[.20,.02,0],size:[.10,.08,.12],color:'#c3dce4'}],anchors:[{id:'grip',position:[0,0,0]}],behaviorId:'tourniquet-behavior'},
  {id:'flashlight',name:'Senter',category:'Alat',parts:[{shape:'cylinder',position:[0,0,0],size:[.058,.27,.058],color:'#2a668b'},{shape:'sphere',position:[0,.15,0],size:[.075,.035,.075],color:'#fce3a0'}],anchors:[{id:'grip',position:[0,0,0]}],behaviorId:'light-behavior'},
  {id:'reflex-hammer',name:'Palu Refleks',category:'Alat',parts:[{shape:'cylinder',position:[0,0,0],size:[.035,.39,.035],color:'#b7a17d'},{shape:'box',position:[0,.18,0],size:[.27,.095,.10],color:'#324857'}],anchors:[{id:'grip',position:[0,-.13,0]}]},
  {id:'monitor',name:'Monitor Pemeriksaan',category:'Alat',parts:[{shape:'box',position:[0,.26,0],size:[.52,.37,.12],color:'#243b50'},{shape:'box',position:[0,.27,.067],size:[.43,.27,.015],color:'#3f7890'},{shape:'cylinder',position:[0,.02,0],size:[.05,.2,.05],color:'#8aa8b4'}],anchors:[{id:'screen',position:[0,.27,.08]}],behaviorId:'monitor-behavior'}
];
const builtInBehaviors = [
  {id:'attach-basic',name:'Pegang / lepaskan',states:['free','held'],initial:'free',transitions:[{from:'free',action:'hold',to:'held',label:'Pegang',effects:[{type:'attach',targetId:'doctor',anchor:'rightHand'}]},{from:'held',action:'release',to:'free',label:'Lepaskan',effects:[{type:'detach'}]}]},
  {id:'tourniquet-behavior',name:'Tourniquet (status demonstrasi)',states:['free','attached','tight'],initial:'free',visuals:{tight:{color:'#d47b52',scale:1.07}},transitions:[{from:'free',action:'attach',to:'attached',label:'Pasang',effects:[{type:'attach',targetId:'patient',anchor:'rightUpperArm'}]},{from:'attached',action:'tighten',to:'tight',label:'Kencangkan'},{from:'tight',action:'loosen',to:'attached',label:'Longgarkan'},{from:'attached',action:'remove',to:'free',label:'Lepas',effects:[{type:'detach'}]},{from:'tight',action:'remove',to:'free',label:'Lepas',effects:[{type:'detach'}]}]},
  {id:'cuff-behavior',name:'Manset (status demonstrasi)',states:['free','wrapped','inflated'],initial:'free',visuals:{inflated:{color:'#497ed1',scale:1.18}},transitions:[{from:'free',action:'wrap',to:'wrapped',label:'Pasang manset',effects:[{type:'attach',targetId:'patient',anchor:'rightUpperArm'}]},{from:'wrapped',action:'inflate',to:'inflated',label:'Pompa'},{from:'inflated',action:'deflate',to:'wrapped',label:'Kempiskan'},{from:'wrapped',action:'remove',to:'free',label:'Lepas',effects:[{type:'detach'}]}]},
  {id:'light-behavior',name:'Lampu senter',states:['off','on'],initial:'off',visuals:{on:{color:'#f4d876'}},transitions:[{from:'off',action:'switch_on',to:'on',label:'Nyalakan'},{from:'on',action:'switch_off',to:'off',label:'Matikan'}]},
  {id:'monitor-behavior',name:'Monitor demo',states:['off','on'],initial:'off',visuals:{on:{color:'#4bb4a1'}},transitions:[{from:'off',action:'power_on',to:'on',label:'Nyalakan'},{from:'on',action:'power_off',to:'off',label:'Matikan'}]}
];
export const TEMPLATES = [
 {id:'shoulder',name:'Pemeriksaan Bahu',category:'Muskuloskeletal',patient:{name:'Pasien simulasi',age:45,complaint:'Nyeri bahu kanan'},steps:['Persiapan dan komunikasi','Inspeksi bahu','Palpasi sesuai indikasi','Gerak aktif bahu','Gerak pasif bahu','Dokumentasi'],note:'Simulasi posisi & urutan OSCE; bukan penilaian teknik otomatis.'},
 {id:'blood-pressure',name:'Pemeriksaan Tekanan Darah',category:'Tanda Vital',patient:{name:'Pasien simulasi',age:52,complaint:'Pemeriksaan tekanan darah'},steps:['Perkenalan dan persetujuan','Posisikan pasien dan lengan','Pasang manset demonstrasi','Lakukan simulasi pengukuran','Catat dan sampaikan hasil skenario'],note:'Pembacaan tekanan darah berasal dari kasus, bukan hasil perhitungan fisiologis.'},
 {id:'neuro',name:'Pemeriksaan Neurologis Dasar',category:'Neurologi',patient:{name:'Pasien simulasi',age:37,complaint:'Keluhan baal pada tangan'},steps:['Perkenalan dan persetujuan','Inspeksi','Pemeriksaan refleks sesuai referensi','Pemeriksaan sensorik simulasi','Dokumentasi'],note:'Respons refleks/sensorik adalah temuan skenario, bukan simulasi saraf.'}
];
const neutralPose = () => ({rightShoulder:{flexion:0,abduction:8,rotation:0},leftShoulder:{flexion:0,abduction:-8,rotation:0},rightElbow:{flexion:0,rotation:0},leftElbow:{flexion:0,rotation:0},rightWrist:{flexion:0},leftWrist:{flexion:0},rightHip:{flexion:0,abduction:0},leftHip:{flexion:0,abduction:0},rightKnee:{flexion:0},leftKnee:{flexion:0},rightAnkle:{flexion:0},leftAnkle:{flexion:0},neck:{flexion:0,rotation:0},spine:{flexion:0,rotation:0}});
export const POSES = {
 standing: neutralPose(),
 sitting: {...neutralPose(),rightHip:{flexion:-90,abduction:0},leftHip:{flexion:-90,abduction:0},rightKnee:{flexion:90},leftKnee:{flexion:90}},
 'right-shoulder-abduction': {...neutralPose(),rightShoulder:{flexion:0,abduction:95,rotation:0}},
 'raised-arm': {...neutralPose(),rightShoulder:{flexion:125,abduction:0,rotation:0},rightElbow:{flexion:35}}
};
export function defaultScene(){return {schemaVersion:1,id:'main',revision:0,title:'My Studio',environment:{floor:'#e9eeeb',wall:'#f0f0f0',grid:false},scenario:{...copy(TEMPLATES[0]),completed:[]},entities:[
  {id:'doctor',type:'character',role:'doctor',name:'Dokter',position:[-1.6,0,.45],rotation:[0,.48,0],pose:neutralPose()},
  {id:'patient',type:'character',role:'patient',name:'Pasien',position:[-.2,0,0],rotation:[0,-.38,0],pose:neutralPose()},
  {id:'bed-1',type:'asset',assetId:'bed',name:'Bed Pemeriksaan',position:[.65,0,-1.28],rotation:[0,1.57,0],status:null},
  {id:'table-1',type:'asset',assetId:'table',name:'Meja Instrumen',position:[-2.2,0,-1.55],rotation:[0,0,0],status:null},
  {id:'goniometer-1',type:'asset',assetId:'goniometer',name:'Goniometer',position:[-2.2,.78,-1.5],rotation:[0,0,0],status:null}
 ]};}
function validateAsset(asset){
  if(!asset||!cleanId(asset.id)||typeof asset.name!=='string'||asset.name.trim().length<2||asset.name.length>90) fail('Aset membutuhkan id dan nama yang valid');
  if(!Array.isArray(asset.parts)||asset.parts.length<1||asset.parts.length>60) fail('Aset membutuhkan 1–60 bagian 3D');
  for(const part of asset.parts){if(!['box','sphere','cylinder'].includes(part.shape)||!vector(part.position,20)||!vector(part.size,20)||part.size.some(n=>n<=.002)||!color(part.color)) fail(`Geometri tidak valid pada aset ${asset.id}`);}
  if(asset.anchors!==undefined){if(!Array.isArray(asset.anchors)||asset.anchors.length>30||asset.anchors.some(a=>!cleanId(a.id)||!vector(a.position,20))) fail('Anchor aset tidak valid');}
  if(asset.behaviorId!==undefined && asset.behaviorId!==null && !cleanId(asset.behaviorId)) fail('behaviorId tidak valid');
  return {id:asset.id,name:asset.name.trim(),category:String(asset.category||'Buatan AI').slice(0,45),description:String(asset.description||'').slice(0,400),parts:copy(asset.parts),anchors:copy(asset.anchors||[]),behaviorId:asset.behaviorId||null,custom:true,version:Number.isInteger(asset.version)?asset.version:1};
}
function validateBehavior(b){
  if(!b||!cleanId(b.id)||typeof b.name!=='string'||b.name.length>90||!Array.isArray(b.states)||b.states.length<1||b.states.length>24) fail('Behavior membutuhkan id, nama, dan 1–24 state');
  const unique = [...new Set(b.states)];
  if(unique.length!==b.states.length||unique.some(s=>!cleanId(s))||!unique.includes(b.initial)) fail('State behavior tidak valid');
  if(!Array.isArray(b.transitions)||b.transitions.length>100) fail('Maksimal 100 transisi');
  const edges=new Set();for(const t of b.transitions){if(!unique.includes(t.from)||!unique.includes(t.to)||!cleanId(t.action)||typeof t.label!=='string'||t.label.length<1||t.label.length>80) fail('Transisi behavior tidak valid');const key=t.from+'::'+t.action;if(edges.has(key)) fail('Transisi ambigu: aksi yang sama dari state yang sama');edges.add(key);if(t.effects!==undefined){if(!Array.isArray(t.effects)||t.effects.length>6)fail('Maksimal enam efek per transisi');for(const effect of t.effects){if(!effect||!['attach','detach','move'].includes(effect.type))fail('Efek behavior tidak didukung');if(effect.type==='attach'&&(!cleanId(effect.targetId)||!cleanId(effect.anchor)))fail('Target/anchor efek attach invalid');if(effect.type==='move'&&!vector(effect.position,30))fail('Posisi efek move invalid');}}}
  const visuals=b.visuals||{};if(typeof visuals!=='object'||Array.isArray(visuals)||visuals===null||Object.keys(visuals).some(s=>!unique.includes(s)))fail('visuals harus berisi status yang ada');for(const spec of Object.values(visuals)){if(!spec||typeof spec!=='object'||Array.isArray(spec)||(spec.color!==undefined&&!color(spec.color))||(spec.scale!==undefined&&(!finite(spec.scale)||spec.scale<.3||spec.scale>3)))fail('visual state invalid');}
  return {id:b.id,name:b.name,states:unique,initial:b.initial,transitions:copy(b.transitions),visuals:copy(visuals),custom:true,version:Number.isInteger(b.version)?b.version:1};
}
// v0.2 saved the built-in grip rules alongside user assets and in undo snapshots.
function upgradeBuiltInGrip(state) {
  const activeGrip=state.behaviors.find(behavior=>behavior.id==='attach-basic'&&!behavior.custom);
  const hold=activeGrip?.transitions.find(transition=>transition.from==='free'&&transition.action==='hold'&&transition.to==='held');
  if (hold && !hold.effects?.length) {
    hold.effects=copy(builtInBehaviors[0].transitions[0].effects);
  }
}
export class Studio {
  constructor(state=null) {
    const loaded=state || {scene:defaultScene(),assets:builtInAssets,behaviors:builtInBehaviors};
    const current=copy(loaded);
    const {scene,assets,behaviors,log=[],undoStack=[],redoStack=[]}=current;
    for (const entry of [current,...undoStack,...redoStack]) upgradeBuiltInGrip(entry);
    Object.assign(this,{scene,assets,behaviors,log,undoStack,redoStack});
    this.listeners=new Set();
  }
  current(){return {scene:this.scene,assets:this.assets,behaviors:this.behaviors};}
  snapshot(){return copy({...this.current(),templates:TEMPLATES,poses:POSES});}
  storedState(){return {...this.current(),undoStack:this.undoStack,redoStack:this.redoStack,log:this.log};}
  emit(event){for(const cb of this.listeners){try{cb(event)}catch{}}}
  persist(){}
  get hasPersistentStorage(){return false;}
  transaction(fn,label='update'){
    const old=copy(this.current());const result=fn();this.scene.revision=old.scene.revision+1;try{this.persist()}catch(e){this.scene=old.scene;this.assets=old.assets;this.behaviors=old.behaviors;throw e;}
    this.undoStack.push(old);this.undoStack=this.undoStack.slice(-35);this.redoStack=[];const entry={at:new Date().toISOString(),label,revision:this.scene.revision};this.log.unshift(entry);this.log=this.log.slice(0,80);this.emit(entry);return {ok:true,revision:this.scene.revision,result};
  }
  validateAssetDraft(input){const asset=validateAsset(input);if(this.assets.some(a=>a.id===asset.id))fail('ID aset sudah dipakai','CONFLICT');if(asset.behaviorId&&!this.behaviors.some(b=>b.id===asset.behaviorId))fail('Behavior referensi tidak ada');return {valid:true,asset,partCount:asset.parts.length};}
  validateBehaviorDraft(input){const behavior=validateBehavior(input);if(this.behaviors.some(b=>b.id===behavior.id))fail('ID behavior sudah dipakai','CONFLICT');return {valid:true,behavior,transitionCount:behavior.transitions.length};}
  save(){this.persist();return {ok:true,revision:this.scene.revision,stored:this.hasPersistentStorage};}
  createAsset(input){const asset=validateAsset(input);if(this.assets.some(a=>a.id===asset.id))fail('ID aset sudah dipakai','CONFLICT');if(asset.behaviorId&&!this.behaviors.some(b=>b.id===asset.behaviorId))fail('Behavior referensi tidak ada');return this.transaction(()=>{this.assets.push(asset);return asset},'create_asset');}
  createBehavior(input){const behavior=validateBehavior(input);if(this.behaviors.some(b=>b.id===behavior.id))fail('ID behavior sudah dipakai','CONFLICT');return this.transaction(()=>{this.behaviors.push(behavior);return behavior},'create_behavior');}
  updateAsset(id,changes){const i=this.assets.findIndex(a=>a.id===id);if(i<0)fail('Aset tidak ditemukan','NOT_FOUND');if(!this.assets[i].custom)fail('Aset bawaan tidak bisa ditimpa; duplikasi dengan ID baru');const asset=validateAsset({...this.assets[i],...changes,id,version:this.assets[i].version+1});if(asset.behaviorId&&!this.behaviors.some(b=>b.id===asset.behaviorId))fail('Behavior tidak ditemukan');
   const used=new Set(this.scene.entities.filter(e=>e.attachedTo&&this.scene.entities.some(parent=>parent.id===e.attachedTo&&parent.assetId===id)).map(e=>e.anchor));
   for(const anchor of used)if(!asset.anchors.some(a=>a.id===anchor))fail(`Anchor '${anchor}' masih dipakai oleh instrumen lain`,'INCOMPATIBLE_UPDATE');
   return this.transaction(()=>{this.assets[i]=asset;return asset},'update_asset');}
  updateBehavior(id,changes){const i=this.behaviors.findIndex(b=>b.id===id);if(i<0)fail('Behavior tidak ditemukan','NOT_FOUND');if(!this.behaviors[i].custom)fail('Behavior bawaan tidak bisa ditimpa');const b=validateBehavior({...this.behaviors[i],...changes,id,version:this.behaviors[i].version+1});
   const assetIds=new Set(this.assets.filter(a=>a.behaviorId===id).map(a=>a.id));
   for(const e of this.scene.entities)if(e.type==='asset'&&assetIds.has(e.assetId)&&e.status&&!b.states.includes(e.status))fail(`Perilaku baru menghapus state aktif '${e.status}' pada ${e.id}`,'INCOMPATIBLE_UPDATE');
   return this.transaction(()=>{this.behaviors[i]=b;return b},'update_behavior');}
  apply(operations,baseRevision){
    if(!Array.isArray(operations)||operations.length<1||operations.length>50)fail('Perintah membutuhkan 1–50 operasi');
    if(!Number.isInteger(baseRevision)||baseRevision!==this.scene.revision)throw new SceneError(`Revisi konflik: sekarang ${this.scene.revision}, permintaan ${baseRevision}`,'REVISION_CONFLICT',409);
    const saved=copy(this.scene);let result;
    try{result=this.transaction(()=>{
      const outputs=[];for(const op of operations)outputs.push(this.operation(op));return outputs;
    },`apply_${operations.length}_operations`)}catch(e){this.scene=saved;throw e;}
    return result;
  }
  preview(operations,baseRevision){
    if(!Number.isInteger(baseRevision)||baseRevision!==this.scene.revision)throw new SceneError('Revisi preview tidak cocok dengan scene aktif','REVISION_CONFLICT',409);
    const simulation=new Studio();simulation.scene=copy(this.scene);simulation.assets=copy(this.assets);simulation.behaviors=copy(this.behaviors);
    const result=simulation.apply(operations,baseRevision);
    const oldById=new Map(this.scene.entities.map(e=>[e.id,e]));
    const newById=new Map(simulation.scene.entities.map(e=>[e.id,e]));
    const added=[...newById.keys()].filter(id=>!oldById.has(id));
    const removed=[...oldById.keys()].filter(id=>!newById.has(id));
    const modified=[...newById.entries()].filter(([id,e])=>oldById.has(id)&&JSON.stringify(oldById.get(id))!==JSON.stringify(e)).map(([id])=>id);
    return {ok:true,baseRevision,previewRevision:result.revision,summary:{added,removed,modified},scene:simulation.scene,results:result.result};
  }
  operation(op){
    if(!op||typeof op.type!=='string')fail('Tipe operasi diperlukan');
    const entities=this.scene.entities;
    const entity=()=>{const found=entities.find(e=>e.id===op.entityId);if(!found)fail(`Entity '${op.entityId}' tidak ditemukan`,'NOT_FOUND');return found;};
    switch(op.type){
      case 'spawn_character':{
        if(entities.length>=250)fail('Batas 250 objek');const id=op.id||uid('human');if(!cleanId(id)||entities.some(x=>x.id===id))fail('ID entity duplikat/tidak valid');const e={id,type:'character',role:op.role==='doctor'?'doctor':'patient',name:String(op.name||'Karakter').slice(0,65),position:op.position||[0,0,0],rotation:[0,0,0],pose:neutralPose()};if(!vector(e.position,30))fail('Posisi tidak valid');entities.push(e);return e;}
      case 'spawn_asset':{
        if(entities.length>=250)fail('Batas 250 objek');const asset=this.assets.find(a=>a.id===op.assetId);if(!asset)fail(`Aset '${op.assetId}' tidak tersedia`,'NOT_FOUND');const id=op.id||uid('object');if(!cleanId(id)||entities.some(e=>e.id===id))fail('ID entity duplikat/tidak valid');const e={id,type:'asset',assetId:asset.id,name:asset.name,position:op.position||[0,0,0],rotation:op.rotation||[0,0,0],status:this.behaviors.find(b=>b.id===asset.behaviorId)?.initial||null};if(!vector(e.position,30)||!vector(e.rotation,7))fail('Transform tidak valid');entities.push(e);return e;}
      case 'move_entity': {const e=entity();if(!vector(op.position,30))fail('Posisi tidak valid');e.position=copy(op.position);return e.id;}
      case 'rotate_entity': {const e=entity();if(!vector(op.rotation,7))fail('Rotasi harus berupa 3 angka radian');e.rotation=copy(op.rotation);return e.id;}
      case 'delete_entity': {const e=entity();if(e.id==='doctor'||e.id==='patient')fail('Karakter utama tidak dapat dihapus');this.scene.entities=entities.filter(x=>x.id!==e.id);this.scene.entities.forEach(x=>{if(x.attachedTo===e.id){delete x.attachedTo;delete x.anchor;}});return e.id;}
      case 'set_joint': {const e=entity();if(e.type!=='character')fail('Sendi hanya tersedia untuk karakter');const j=e.pose[op.joint];if(!j||!Object.hasOwn(j,op.axis))fail('Sendi atau sumbu gerak tidak tersedia');if(!finite(op.angle)||op.angle< -180||op.angle>180)fail('Sudut harus -180 sampai 180 derajat');j[op.axis]=op.angle;return {entityId:e.id,joint:op.joint,axis:op.axis,angle:op.angle};}
      case 'apply_pose': {const e=entity();if(e.type!=='character')fail('Pose hanya untuk karakter');const preset=POSES[op.presetId];if(!preset)fail('Pose preset tidak ditemukan');e.pose=copy(preset);return e.id;}
      case 'attach':{const e=entity();const target=entities.find(x=>x.id===op.targetId);if(e.type!=='asset'||!target||e.id===target.id)fail('Target attach tidak valid');const visited=new Set([e.id]);let ptr=target;while(ptr?.attachedTo){if(visited.has(ptr.id))fail('Attachment melingkar');visited.add(ptr.id);ptr=entities.find(x=>x.id===ptr.attachedTo);}if(ptr&&visited.has(ptr.id))fail('Attachment melingkar');const anchor=String(op.anchor||'rightHand');requireAnchor(target,anchor,this.assets);e.attachedTo=target.id;e.anchor=anchor;return e.id;}
      case 'detach':{const e=entity();delete e.attachedTo;delete e.anchor;return e.id;}
      case 'trigger_action':{const e=entity();if(e.type!=='asset')fail('Aksi hanya untuk instrumen');const a=this.assets.find(a=>a.id===e.assetId);const b=this.behaviors.find(b=>b.id===a?.behaviorId);if(!b)fail('Instrumen tidak punya behavior');const t=b.transitions.find(t=>t.from===(e.status||b.initial)&&t.action===op.action);if(!t)fail(`Aksi '${op.action}' tidak tersedia pada state '${e.status}'`,'INVALID_TRANSITION');e.status=t.to;for(const effect of t.effects||[]){if(effect.type==='detach'){delete e.attachedTo;delete e.anchor;}if(effect.type==='attach'){const target=entities.find(v=>v.id===effect.targetId);if(!target||target.id===e.id)fail('Target efek attach tidak ada');const visited=new Set([e.id]);let ptr=target;while(ptr?.attachedTo){if(visited.has(ptr.id))fail('Attachment melingkar');visited.add(ptr.id);ptr=entities.find(v=>v.id===ptr.attachedTo);}if(ptr&&visited.has(ptr.id))fail('Attachment melingkar');requireAnchor(target,effect.anchor,this.assets);e.attachedTo=target.id;e.anchor=effect.anchor;}if(effect.type==='move'){e.position=copy(effect.position);}}return {entityId:e.id,status:e.status,attachedTo:e.attachedTo||null};}
      case 'set_scenario':{const t=TEMPLATES.find(t=>t.id===op.templateId);if(!t)fail('Template skenario tidak dikenal');this.scene.scenario={...copy(t),completed:[]};return t.id;}
      case 'set_scenario_details':{const s=op.scenario;if(!s||typeof s.name!=='string'||s.name.length>100||!Array.isArray(s.steps)||s.steps.length>40||s.steps.some(x=>typeof x!=='string'||x.length>200))fail('Skenario tidak valid');this.scene.scenario={id:cleanId(s.id)?s.id:uid('scenario'),name:s.name,category:String(s.category||'Custom').slice(0,60),patient:copy(s.patient||{}),steps:copy(s.steps),note:String(s.note||'Konten generatif belum divalidasi secara klinis').slice(0,500),completed:[],generated:true};return this.scene.scenario.id;}
      case 'complete_step':case 'uncomplete_step':{const s=this.scene.scenario;if(!Number.isInteger(op.index)||op.index<0||op.index>=s.steps.length)fail('Indeks langkah tidak valid');s.completed=s.completed||[];if(op.type==='complete_step'&&!s.completed.includes(op.index))s.completed.push(op.index);if(op.type==='uncomplete_step')s.completed=s.completed.filter(n=>n!==op.index);return op.index;}
      case 'set_environment':{if(op.floor!==undefined){if(!color(op.floor))fail('Warna lantai tidak valid');this.scene.environment.floor=op.floor;}if(op.wall!==undefined){if(!color(op.wall))fail('Warna dinding tidak valid');this.scene.environment.wall=op.wall;}if(op.grid!==undefined)this.scene.environment.grid=!!op.grid;return this.scene.environment;}
      case 'rename_scene':{if(typeof op.title!=='string'||op.title.length<1||op.title.length>100)fail('Judul tidak valid');this.scene.title=op.title;return op.title;}
      default:fail(`Operasi '${op.type}' tidak dikenal`);
    }
  }
  historyMove(direction){
    const source=direction==='undo'?this.undoStack:this.redoStack;
    const target=direction==='undo'?this.redoStack:this.undoStack;
    if(!source.length)fail(`Tidak ada tindakan untuk ${direction}`,'EMPTY_HISTORY');
    const before=copy(this.current()), next=source.pop();target.push(before);this.scene=copy(next.scene);this.assets=copy(next.assets);this.behaviors=copy(next.behaviors);
    this.scene.revision=before.scene.revision+1;
    try{this.persist()}catch(error){
      // A disk-full/read-only error must not leave the live world and history diverged.
      this.scene=before.scene;this.assets=before.assets;this.behaviors=before.behaviors;
      target.pop();source.push(next);throw error;
    }
    const entry={at:new Date().toISOString(),label:direction,revision:this.scene.revision};this.log.unshift(entry);this.log=this.log.slice(0,80);this.emit(entry);
    return {ok:true,revision:this.scene.revision};
  }
  restore(snapshot,baseRevision){
    if(baseRevision!==this.scene.revision)throw new SceneError('Revisi sudah berubah','REVISION_CONFLICT',409);
    if(!snapshot||snapshot.scene?.schemaVersion!==1||!Array.isArray(snapshot.scene.entities)||snapshot.scene.entities.length>250||!Array.isArray(snapshot.assets)||snapshot.assets.length>300||!Array.isArray(snapshot.behaviors)||snapshot.behaviors.length>300)fail('Snapshot tidak sesuai schema v1');
    for(const a of snapshot.assets)validateAsset(a);
    for(const b of snapshot.behaviors)validateBehavior(b);
    const assetIDs=new Set(),behaviorIDs=new Set();
    for(const a of snapshot.assets){if(assetIDs.has(a.id))fail('ID aset duplikat dalam snapshot');assetIDs.add(a.id);}
    for(const b of snapshot.behaviors){if(behaviorIDs.has(b.id))fail('ID behavior duplikat dalam snapshot');behaviorIDs.add(b.id);}
    for(const a of snapshot.assets)if(a.behaviorId&&!behaviorIDs.has(a.behaviorId))fail('Snapshot mereferensikan behavior yang hilang');
    const entities=snapshot.scene.entities;const ids=new Set();
    for(const e of entities){
      if(!cleanId(e.id)||ids.has(e.id)||!['character','asset'].includes(e.type)||!vector(e.position,30)||!vector(e.rotation,7))fail('Entity snapshot tidak valid');ids.add(e.id);
      if(e.type==='asset'&&!assetIDs.has(e.assetId))fail('Snapshot mereferensikan asset yang hilang');
      if(e.type==='character'){
        const expected=neutralPose();if(!e.pose||typeof e.pose!=='object')fail('Pose karakter snapshot tidak tersedia');
        for(const [j,axes] of Object.entries(expected))for(const axis of Object.keys(axes))if(!finite(e.pose[j]?.[axis])||Math.abs(e.pose[j][axis])>180)fail('Sudut sendi snapshot tidak valid');
      }
      if(e.type==='asset'&&e.status!==null&&e.status!==undefined){
        const a=snapshot.assets.find(x=>x.id===e.assetId),b=snapshot.behaviors.find(x=>x.id===a.behaviorId);
        if(!b?.states?.includes(e.status))fail('Status alat snapshot tidak valid');
      }
    }
    for(const e of entities.filter(e=>e.attachedTo)){
      const target=entities.find(x=>x.id===e.attachedTo);
      if(!target||e.type!=='asset'||e.id===target.id)fail('Target attachment snapshot tidak valid');
      requireAnchor(target,e.anchor,snapshot.assets);
      const seen=new Set([e.id]);let cursor=target;
      while(cursor){if(seen.has(cursor.id))fail('Attachment snapshot membentuk lingkaran');seen.add(cursor.id);cursor=entities.find(x=>x.id===cursor.attachedTo);}
    }
    const scenario=snapshot.scene.scenario;
    if(!scenario||typeof scenario.name!=='string'||scenario.name.length>100||!Array.isArray(scenario.steps)||scenario.steps.length>40||scenario.steps.some(x=>typeof x!=='string'||x.length>200)||!Array.isArray(scenario.completed)||scenario.completed.some(x=>!Number.isInteger(x)||x<0||x>=scenario.steps.length))fail('Skenario snapshot tidak valid');
    if(!snapshot.scene.environment||!color(snapshot.scene.environment.floor)||!color(snapshot.scene.environment.wall)||typeof snapshot.scene.environment.grid!=='boolean')fail('Environment snapshot tidak valid');
    return this.transaction(()=>{this.scene=copy(snapshot.scene);this.assets=copy(snapshot.assets);this.behaviors=copy(snapshot.behaviors);return 'restored'},'restore_snapshot');
  }
  reset(){return this.transaction(()=>{this.scene=defaultScene();return 'reset'},'reset_scene');}
  validateBehaviorTest(id,actions){const b=this.behaviors.find(x=>x.id===id);if(!b)fail('Behavior tidak ditemukan');if(!Array.isArray(actions)||actions.length>100)fail('Maksimal 100 aksi');let status=b.initial;const history=[status],effects=[];for(const action of actions){const t=b.transitions.find(t=>t.from===status&&t.action===action);if(!t)throw new SceneError(`Transisi '${action}' tidak tersedia dari '${status}'`,'INVALID_TRANSITION');status=t.to;history.push(status);effects.push({action,effects:copy(t.effects||[]),visuals:copy(b.visuals?.[status]||{})});}return {behaviorId:id,finalState:status,history,effects};}
}
