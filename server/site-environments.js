import {SceneError, Studio} from './studio.js';
import {callSceneTool, environmentMutations, normalizeSceneArgs, sessionState} from './mcp-protocol.js';

const maxBytes=3_000_000;
const limit=80;
const idPattern=/^env-[0-9a-f]{32}$/;
const fail=(message,code='VALIDATION_ERROR',status=400)=>{throw new SceneError(message,code,status);};
const validName=value=>{
  if(typeof value!=='string'||!value.trim()||value.trim().length>90||/[\x00-\x1f]/.test(value))fail('Nama environment harus 1–90 karakter');
  return value.trim();
};
const updateTime=()=>new Date().toISOString();
const metadata=r=>({id:r.id,name:r.name,revision:r.revision,createdAt:r.createdAt,updatedAt:r.updatedAt,sceneTitle:r.snapshot.scene.title});
const missing=()=>fail('Environment tidak ada atau sudah dihapus','NOT_FOUND',404);
const conflict=()=>fail('Environment telah berubah. Muat ulang sebelum mengedit.','ENVIRONMENT_REVISION_CONFLICT',409);

export const blueprintTools=new Set(['create_environment','list_environments','get_environment','load_environment','rename_environment','delete_environment','undo_environment','redo_environment']);

export class SiteEnvironments {
  constructor(bucket,identity){
    this.bucket=bucket;
    this.prefix='environments/v09/'+encodeURIComponent(identity)+'/';
  }
  key(id){
    if(typeof id!=='string'||!idPattern.test(id))fail('ID environment tidak valid','INVALID_ID');
    return this.prefix+id+'.json';
  }
  async read(id){
    const object=await this.bucket.get(this.key(id));
    if(!object)missing();
    const record=await object.json();
    if(record.schemaVersion!==1||record.id!==id||!record.snapshot?.scene)fail('Environment tersimpan rusak','STORAGE_CORRUPT',500);
    return {record,etag:object.etag};
  }
  async list(){
    const result=[];
    let cursor;
    do {
      const page=await this.bucket.list({prefix:this.prefix,include:['customMetadata'],limit:100,cursor});
      for(const object of page.objects){
        if(!object.customMetadata?.summary)continue;
        result.push(JSON.parse(object.customMetadata.summary));
      }
      cursor=page.truncated?page.cursor:undefined;
    }while(cursor);
    return result.sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));
  }
  async write(record,etag){
    const data=JSON.stringify(record);
    if(new TextEncoder().encode(data).byteLength>maxBytes)fail('Environment melebihi batas 3 MB','STORAGE_LIMIT',413);
    const saved=await this.bucket.put(this.key(record.id),data,{
      onlyIf:etag?{etagMatches:etag}:new Headers({'If-None-Match':'*'}),
      customMetadata:{summary:JSON.stringify(metadata(record))},
    });
    if(!saved)conflict();
    return metadata(record);
  }
  async create({name,operations=[]}){
    name=validName(name);
    if(!Array.isArray(operations)||operations.length>50)fail('Maksimal 50 operasi awal');
    if((await this.list()).length>=limit)fail('Batas 80 environment tercapai','ENVIRONMENT_LIMIT',409);
    const studio=new Studio();
    if(operations.length)studio.apply(operations,studio.scene.revision);
    const id='env-'+crypto.randomUUID().replaceAll('-',''),now=updateTime();
    const record={schemaVersion:1,id,name,revision:1,contentRevision:1,createdAt:now,updatedAt:now,snapshot:studio.current(),undo:[],redo:[]};
    await this.write(record);
    return record;
  }
  async remove(id,confirmed){
    if(confirmed!==true)fail('Konfirmasi penghapusan diperlukan','CONFIRMATION_REQUIRED');
    const {record}=await this.read(id);
    await this.bucket.delete(this.key(id));
    return {deleted:true,id,name:record.name};
  }
  async rename(id,name){
    name=validName(name);
    const {record,etag}=await this.read(id);
    record.name=name;
    record.revision++;
    record.updatedAt=updateTime();
    return this.write(record,etag);
  }
  async history(id,direction){
    const {record,etag}=await this.read(id);
    const other=direction==='undo'?'redo':'undo';
    const previous=record[direction].pop();
    if(!previous)fail('Tidak ada perubahan GPT untuk '+direction,'EMPTY_HISTORY');
    record[other]=[...record[other],record.snapshot].slice(-12);
    record.snapshot=previous;
    record.revision++;
    record.contentRevision++;
    record.updatedAt=updateTime();
    await this.write(record,etag);
    return record;
  }
  async detachDeleted(studio){
    if(!studio.environmentId)return;
    const object=await this.bucket.head(this.key(studio.environmentId));
    if(object){
      const summary=object.customMetadata?.summary;
      if(summary)studio.environmentRevision=JSON.parse(summary).revision;
      return;
    }
    studio.environmentId=null;
    studio.environmentRevision=null;
    studio.environmentContentRevision=null;
  }
  async load(project,record){
    const studio=project.studio;
    const revision=studio.scene.revision+1;
    Object.assign(studio,structuredClone(record.snapshot));
    studio.scene.revision=revision;
    studio.undoStack=[];studio.redoStack=[];studio.log=[];
    studio.environmentId=record.id;
    studio.environmentRevision=record.revision;
    studio.environmentContentRevision=record.contentRevision;
    await project.commit();
    return {environment:metadata(record),...sessionState(studio)};
  }
  async mutate(project,name,args){
    const live=project.studio;
    if(!live.environmentId || args.saveToEnvironment===false || !environmentMutations.has(name)){
      const value=callSceneTool(live,name,args);
      await project.commit();
      return value;
    }
    let saved;
    try{saved=await this.read(live.environmentId);}catch(error){
      if(error.code!=='NOT_FOUND')throw error;
      live.environmentId=null;live.environmentRevision=null;live.environmentContentRevision=null;
      const value=callSceneTool(live,name,args);
      await project.commit();
      return value;
    }
    const {record,etag}=saved;
    if(live.environmentContentRevision!==record.contentRevision)conflict();
    const normalized=normalizeSceneArgs(args);
    const baseline=new Studio(record.snapshot);
    const baselineArgs=name==='apply_scene_operations'?{...normalized,baseRevision:baseline.scene.revision}:normalized;
    callSceneTool(baseline,name,baselineArgs);
    const value=callSceneTool(live,name,normalized);
    record.undo=[...record.undo,record.snapshot].slice(-12);
    record.redo=[];
    record.snapshot=baseline.current();
    record.revision++;
    record.contentRevision++;
    record.updatedAt=updateTime();
    // Durable blueprint is authoritative. Never retry an already persisted edit
    // if a concurrent tablet write or close prevents synchronizing the session.
    const environment=await this.write(record,etag);
    live.environmentRevision=record.revision;
    live.environmentContentRevision=record.contentRevision;
    try{await project.commit();}
    catch{return {...value,environment,autoSaved:true,sessionNeedsReload:true};}
    return {...value,environment,autoSaved:true};
  }
}

export async function runBlueprintTool(library,session,name,args){
  const id=args.environmentId;
  switch(name){
    case 'list_environments':return {environments:await library.list()};
    case 'get_environment':{
      const {record}=await library.read(id);
      return {...metadata(record),snapshot:record.snapshot};
    }
    case 'rename_environment':return {environment:await library.rename(id,args.name),saved:true};
    case 'delete_environment':return library.remove(id,args.confirmed);
    case 'create_environment':{
      const project=args.sessionId?await session(args.sessionId):null;
      const record=await library.create(args);
      if(!project)return {environment:metadata(record),saved:true};
      try{return {...await library.load(project,record),saved:true};}
      catch{return {environment:metadata(record),saved:true,sessionNeedsReload:true};}
    }
    case 'load_environment':{
      const {record}=await library.read(id);
      return library.load(await session(args.sessionId,true),record);
    }
    case 'undo_environment':case 'redo_environment':{
      const project=args.sessionId?await session(args.sessionId):null;
      const record=await library.history(id,name==='undo_environment'?'undo':'redo');
      if(!project)return {environment:metadata(record),saved:true};
      try{return {...await library.load(project,record),saved:true};}
      catch{return {environment:metadata(record),saved:true,sessionNeedsReload:true};}
    }
    default:fail('Tool environment tidak tersedia','NOT_FOUND',404);
  }
}
