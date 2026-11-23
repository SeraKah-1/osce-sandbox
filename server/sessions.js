import crypto from 'node:crypto';
import {makeStudio,SceneError} from './core.js';

// Session worlds are RAM-only. No file, cookie, localStorage or database is used.
// Each browser/ChatGPT view has an isolated world, and stale worlds are reclaimed.
export class SessionWorlds {
  constructor({ttlMs=120*60_000,maxSessions=128,onUpdate=()=>{}}={}){
    this.ttlMs=ttlMs;this.maxSessions=maxSessions;this.onUpdate=onUpdate;this.sessions=new Map();
  }
  create(){
    this.sweep();
    if(this.sessions.size>=this.maxSessions)throw new SceneError('Terlalu banyak sesi aktif','SESSION_LIMIT',503);
    const id=crypto.randomUUID();const studio=makeStudio(null);studio.sessionId=id;
    const item={id,studio,lastUsed:Date.now()};this.sessions.set(id,item);
    studio.listeners.add(event=>this.onUpdate(id,event));
    return {sessionId:id,...studio.snapshot()};
  }
  get(id){
    if(!id||typeof id!=='string'||!this.sessions.has(id))throw new SceneError('Sesi berakhir. Buka studio lagi untuk mulai dari awal.','SESSION_EXPIRED',410);
    const item=this.sessions.get(id);
    if(Date.now()-item.lastUsed>this.ttlMs){this.sessions.delete(id);throw new SceneError('Sesi kedaluwarsa. Muat ulang untuk memulai dari awal.','SESSION_EXPIRED',410);}
    item.lastUsed=Date.now();return item.studio;
  }
  close(id){return this.sessions.delete(id);}
  sweep(){for(const [id,item] of this.sessions)if(Date.now()-item.lastUsed>this.ttlMs)this.sessions.delete(id);}
}
