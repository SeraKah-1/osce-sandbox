import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';

const read = path => readFile(path,'utf8');
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
const sourceModules=['site-sessions.js','site-environments.js','mcp-protocol.js','widget-template.js'];
await Promise.all(sourceModules.map(name=>copyFile('server/'+name,'dist/server/'+name)));
await copyFile('server/sites-worker.js','dist/server/index.js');
for(const file of ['placement.js','scene-delta.js','coupling.js']) await copyFile('web/'+file,'dist/server/'+file);
await writeFile('dist/server/studio.js',(await read('server/studio.js')).replaceAll('../web/','./'));

const files=['index.html','app.js','coupling.js','learning.js','optimistic.js','scene-delta.js','spatial.js','render3d.js','touch-pose.js','assembly.js','ik3d.js','placement.js','styles.css','icon.svg','manifest.webmanifest','sw.js'];
const assets=Object.fromEntries(await Promise.all(files.map(async name=>[name,await read('web/'+name)])));
assets['index.html']=assets['index.html'].replace('<head>','<head><meta name="studio-host" content="chatgpt-sites">');
await writeFile('dist/server/assets.js','export default '+JSON.stringify(assets)+';\n');
