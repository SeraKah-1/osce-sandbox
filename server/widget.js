import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {renderWidget} from './widget-template.js';
export {WIDGET_URI} from './widget-template.js';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

export function widgetHTML(){return renderWidget(read('web/widget.css'),read('web/render3d.js'),read('web/widget-ui.js'));}
