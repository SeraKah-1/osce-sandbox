import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {makeStudio,copy,SceneError} from './core.js';

const ID=/^env-[0-9a-f]{32}$/;
const fail=(message,code='VALIDATION_ERROR',status=400)=>{throw new SceneError(message,code,status)};
const snapOf=studio=>{const {scene,assets,behaviors}=studio.snapshot();return {scene,assets,behaviors};};
const validateName=name=>{
  if(typeof name!=='string'||!name.trim()||name.trim().length>90||/[\x00-\x1f]/.test(name))fail('Nama environment harus 1–90 karakter');
  return name.trim();
};
const studioWith=snapshot=>{
 const studio=makeStudio(null);
 // restore() validates all entities, references, shapes, behaviors and schema.
 if(snapshot){studio.restore(snapshot,studio.scene.revision);studio.scene.revision=snapshot.scene.revision;}
 return studio;
};

// Single-tenant library: protected by API_TOKEN and hosted on a persistent volume.
// Touch gestures change *only* a session. MCP edits are mirrored to saved blueprint.
export class EnvironmentLibrary {
 constructor({directory,limit=80,maxBytes=3_000_000}={}){
  if(!directory||typeof directory!=='string')fail('ENVIRONMENT_DATA_DIR wajib berupa direktori','CONFIG_ERROR',500);
  this.directory=path.resolve(directory);this.limit=limit;this.maxBytes=maxBytes;
  fs.mkdirSync(this.directory,{recursive:true,mode:0o700});
  // Fail startup rather than falsely promise autosave on a read-only deployment.
  const probe=path.join(this.directory,'.write-probe-'+crypto.randomUUID());
  try{fs.writeFileSync(probe,'ok',{flag:'wx',mode:0o600});fs.unlinkSync(probe)}catch(e){fail('Direktori environment tidak dapat ditulis: '+e.message,'STORAGE_UNAVAILABLE',503)}
 }
 filename(id){if(!ID.test(id))fail('ID environment tidak valid','INVALID_ID');return path.join(this.directory,`${id}.json`);}
 read(id){
  let raw;try{raw=fs.readFileSync(this.filename(id),'utf8');}catch(e){if(e.code==='ENOENT')fail('Environment tidak ada atau sudah dihapus','NOT_FOUND',404);throw e;}
  try{
   const record=JSON.parse(raw);if(record.schemaVersion!==1||record.id!==id||!record.snapshot)throw Error('Format arsip tidak valid');
   return record;
  }catch(e){fail('Environment tersimpan rusak: '+e.message,'STORAGE_CORRUPT',500)}
 }
 list(){
  const files=fs.readdirSync(this.directory).filter(f=>/^env-[0-9a-f]{32}\.json$/.test(f));
  const rows=files.map(f=>{const r=this.read(f.slice(0,-5));return this.meta(r)});
  return rows.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
 }
 meta(r){return {id:r.id,name:r.name,createdAt:r.createdAt,updatedAt:r.updatedAt,revision:r.revision,sceneTitle:r.snapshot.scene.title};}
 write(record,{newFile=false}={}){
  const raw=JSON.stringify(record);if(Buffer.byteLength(raw)>this.maxBytes)fail('Environment melebihi batas '+this.maxBytes+' byte','STORAGE_LIMIT',413);
  const target=this.filename(record.id),tmp=path.join(this.directory,'.'+record.id+'.'+crypto.randomUUID()+'.tmp');
  try{
   const fd=fs.openSync(tmp,'wx',0o600);
   try{fs.writeFileSync(fd,raw);fs.fsyncSync(fd)}finally{fs.closeSync(fd)}
   if(newFile&&fs.existsSync(target))fail('Environment sudah ada','CONFLICT',409);
   fs.renameSync(tmp,target);
   try{const dirFd=fs.openSync(this.directory,fs.constants.O_RDONLY);try{fs.fsyncSync(dirFd)}finally{fs.closeSync(dirFd)}}catch{}
  }finally{try{fs.unlinkSync(tmp)}catch{}}
 }
 create({name,operations=[]}={}){
  name=validateName(name);
  if(!Array.isArray(operations)||operations.length>50)fail('Maksimal 50 operasi awal');
  if(this.list().length>=this.limit)fail(`Batas ${this.limit} environment tercapai`,'ENVIRONMENT_LIMIT',409);
  const studio=makeStudio(null);if(operations.length){studio.apply(operations,studio.scene.revision)}
  const id='env-'+crypto.randomBytes(16).toString('hex'),now=new Date().toISOString();
  const record={schemaVersion:1,id,name,revision:1,createdAt:now,updatedAt:now,snapshot:snapOf(studio),undo:[],redo:[]};
  this.write(record,{newFile:true});return this.meta(record);
 }
 get(id,{withSnapshot=false}={}){
  const record=this.read(id);
  if(withSnapshot)studioWith(record.snapshot); // fail closed if stored world is invalid.
  return withSnapshot?{...this.meta(record),snapshot:copy(record.snapshot)}:this.meta(record);
 }
 rename(id,name){const record=this.read(id);record.name=validateName(name);record.revision++;record.updatedAt=new Date().toISOString();this.write(record);return this.meta(record);}
 delete(id,{confirmed=false}={}){
  if(confirmed!==true)fail('Konfirmasi penghapusan diperlukan','CONFIRMATION_REQUIRED');
  const record=this.read(id),file=this.filename(id);
  // Rename first: a crash after rename leaves the item invisible to the library.
  const tombstone=path.join(this.directory,'.deleted-'+id+'-'+crypto.randomUUID());
  fs.renameSync(file,tombstone);try{fs.unlinkSync(tombstone)}catch{}
  return {deleted:true,id:record.id,name:record.name};
 }
 attach(session,id){const record=this.read(id);const validated=studioWith(record.snapshot);
  const studio=session.studio||session;const previous=studio.snapshot();
  studio.scene=copy(validated.scene);studio.scene.revision=previous.scene.revision+1;studio.assets=copy(validated.assets);studio.behaviors=copy(validated.behaviors);
  studio.undoStack=[];studio.redoStack=[];studio.log=[];studio.environmentId=id;studio.environmentRevision=record.revision;
  studio.emit({at:new Date().toISOString(),label:'environment_loaded',revision:studio.scene.revision});
  return {environment:this.meta(record),environmentId:id,sessionId:studio.sessionId,...studio.snapshot()};
 }
 // Runs in one synchronous event-loop turn: dry-run both states, update live, durably
 // persist ONLY the MCP operation applied to the saved baseline, then dispatch UI event.
 // Manual drag deltas remain transient even if ChatGPT edits the same session later.
 mutate(studio,action){
  if(!studio.environmentId)return action(studio);
  const record=this.read(studio.environmentId);
  if(studio.environmentRevision!==record.revision)fail('Environment telah berubah di sesi lain. Muat ulang environment untuk melanjutkan.','ENVIRONMENT_REVISION_CONFLICT',409);
  const saved=studioWith(record.snapshot),preflight=studioWith(snapOf(studio));
  action(preflight,'live');action(saved,'baseline'); // any validation failure occurs before live scene changes.
  const old={scene:copy(studio.scene),assets:copy(studio.assets),behaviors:copy(studio.behaviors),undoStack:copy(studio.undoStack),redoStack:copy(studio.redoStack),log:copy(studio.log)};
  const originalEmit=studio.emit;const queued=[];studio.emit=event=>queued.push(event);
  try{
   const response=action(studio,'live');
   record.undo=[...(record.undo||[]),copy(record.snapshot)].slice(-12);record.redo=[];
   record.snapshot=snapOf(saved);record.revision++;record.updatedAt=new Date().toISOString();
   this.write(record);studio.environmentRevision=record.revision;
   studio.emit=originalEmit;for(const event of queued)studio.emit(event);
   return {...response,environment:this.meta(record),autoSaved:true};
  }catch(e){
   studio.scene=old.scene;studio.assets=old.assets;studio.behaviors=old.behaviors;
   studio.undoStack=old.undoStack;studio.redoStack=old.redoStack;studio.log=old.log;studio.emit=originalEmit;
   throw e;
  }
 }
 history(id,direction){
  if(!['undo','redo'].includes(direction))fail('Arah history tidak valid');
  const record=this.read(id),key=direction==='undo'?'undo':'redo',other=direction==='undo'?'redo':'undo';
  const stack=record[key]||[];
  if(!stack.length)fail(`Tidak ada perubahan GPT untuk ${direction}`,'EMPTY_HISTORY');
  const previous=stack.pop();studioWith(previous); // verify before swapping saved state
  record[other]=[...(record[other]||[]),copy(record.snapshot)].slice(-12);
  record[key]=stack;record.snapshot=copy(previous);record.revision++;
  record.updatedAt=new Date().toISOString();this.write(record);return this.meta(record);
 }

}
