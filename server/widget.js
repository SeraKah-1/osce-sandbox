import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {renderWidget} from './widget-template.js';
export {WIDGET_URI} from './widget-template.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

export function widgetHTML(){
 const filenames=['index.html','styles.css','assembly.js','ik3d.js','placement.js','touch-pose.js','render3d.js','app.js','coupling.js','learning.js','optimistic.js','scene-delta.js','spatial.js'];
 return renderWidget(Object.fromEntries(filenames.map(file=>[file,read('web/'+file)])));
}
