import {SceneError, Studio} from './studio.js';
import {diffWorld} from './scene-delta.js';

const PREFIX='temporary/v06/';
const TTL_MS=2*60*60*1000;
const validId=/^(\d{13})\.([a-f0-9-]{36})$/;

export const sessionExpired=()=>new SceneError('Sesi berakhir. Buka sesi baru untuk mulai dari scene awal.','SESSION_EXPIRED',410);

export class SiteSessions {
  constructor(bucket,identity) {
    if (!identity) throw new SceneError('Masuk dengan ChatGPT untuk membuka sesi.','AUTH_REQUIRED',401);
    if (!bucket) throw new SceneError('Penyimpanan sesi belum tersedia.','STORAGE_UNAVAILABLE',503);
    this.bucket=bucket;
    this.owner=encodeURIComponent(identity);
  }

  key(id) {
    if (!id) throw new SceneError('Buka open_studio atau salin ID sesi dari tablet, lalu sertakan sessionId.','SESSION_REQUIRED',400);
    const match=typeof id==='string' && validId.exec(id);
    if (!match || Number(match[1])<=Date.now()) throw sessionExpired();
    return PREFIX+match[1]+'/'+this.owner+'/'+match[2]+'.json';
  }

  async create() {
    const id=(Date.now()+TTL_MS)+'.'+crypto.randomUUID();
    const studio=new Studio();
    const created=await this.bucket.put(this.key(id),JSON.stringify(studio.storedState()),{
      onlyIf:new Headers({'If-None-Match':'*'}),customMetadata:{revision:'0'},
    });
    if (!created) throw new SceneError('ID sesi bentrok. Mulai sesi baru.','SESSION_CONFLICT',409);
    return {sessionId:id,...studio.snapshot()};
  }

  async open(id) {
    const object=await this.bucket.get(this.key(id));
    if (!object) throw sessionExpired();
    const savedState=await object.json();
    const studio=new Studio(savedState);
    for(const key of ['environmentId','environmentRevision','environmentContentRevision']) studio[key]=savedState[key]??null;
    studio.sessionId=id;
    const initial=studio.scene.revision;
    return {studio,commit:async()=>{
      const revision=studio.scene.revision;
      if (revision===initial) return;
      const delta=revision===initial+1&&studio.environmentId===(savedState.environmentId??null)&&studio.environmentRevision===(savedState.environmentRevision??null)?diffWorld(savedState,studio.current()):null;
      const lastDelta=delta&&JSON.stringify(delta).length<250_000?delta:null;
      const data=new TextEncoder().encode(JSON.stringify({lastDelta,...studio.storedState(),environmentId:studio.environmentId,environmentRevision:studio.environmentRevision,environmentContentRevision:studio.environmentContentRevision}));
      if (data.byteLength>12_000_000) throw new SceneError('Sesi dan riwayat melebihi batas penyimpanan.','SESSION_TOO_LARGE',413);
      const saved=await this.bucket.put(this.key(id),data,{
        onlyIf:{etagMatches:object.etag},customMetadata:{revision:String(revision)},
      });
      if (!saved) throw new SceneError('Revisi konflik atau sesi telah ditutup. Muat ulang sebelum mengedit.','REVISION_CONFLICT',409);
    }};
  }

  async revision(id) {
    const object=await this.bucket.head(this.key(id));
    if (!object) throw sessionExpired();
    return Number(object.customMetadata.revision);
  }

  async event(id,since){
    const revision=await this.revision(id);
    if(revision!==since+1)return {revision};
    const object=await this.bucket.get(this.key(id));
    if(!object)throw sessionExpired();
    const state=await object.json();
    return {revision:state.scene.revision,delta:state.lastDelta?.revision===since+1?state.lastDelta:undefined};
  }

  async close(id) {
    await this.bucket.delete(this.key(id));
  }

  async sweep() {
    // R2 sorts keys lexicographically. The 13-digit expiry puts the oldest first.
    const now=Date.now();
    let cursor;
    for(let page=0;page<5;page++){
      const result=await this.bucket.list({prefix:PREFIX,limit:200,cursor});
      const expired=result.objects.filter(object=>Number(object.key.slice(PREFIX.length,PREFIX.length+13))<=now);
      if(expired.length)await this.bucket.delete(expired.map(object=>object.key));
      if(!result.truncated||expired.length<result.objects.length)break;
      cursor=result.cursor;
    }
  }
}
