import fs from 'node:fs';
import path from 'node:path';
import {SceneError, Studio as StudioModel} from './studio.js';

export * from './studio.js';

export class Studio extends StudioModel {
  constructor(storageFile=null) {
    let loaded=null;
    if (storageFile && fs.existsSync(storageFile)) {
      try {
        const data=JSON.parse(fs.readFileSync(storageFile,'utf8'));
        if (data?.scene?.entities && data?.assets && data?.behaviors) loaded=data;
      } catch (error) {
        throw new SceneError('Data studio gagal dimuat: '+error.message,'STORAGE_CORRUPT',500);
      }
    }
    super(loaded);
    this.storageFile=storageFile;
  }
  get hasPersistentStorage(){return Boolean(this.storageFile);}
  persist() {
    if (!this.storageFile) return;
    fs.mkdirSync(path.dirname(this.storageFile),{recursive:true});
    const temp=this.storageFile+'.tmp';
    fs.writeFileSync(temp,JSON.stringify(this.current(),null,2));
    fs.renameSync(temp,this.storageFile);
  }
}

export function makeStudio(file){return new Studio(file);}
