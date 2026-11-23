import {mkdir,readFile,writeFile,copyFile,rm} from 'node:fs/promises';

const read = path => readFile(path,'utf8');
await rm('dist',{recursive:true,force:true});
await mkdir('dist/server',{recursive:true});
const sourceModules=['site-sessions.js','mcp-protocol.js','widget-template.js'];
await Promise.all(sourceModules.map(name=>copyFile('server/'+name,'dist/server/'+name)));
await copyFile('server/sites-worker.js','dist/server/index.js');
await copyFile('web/placement.js','dist/server/placement.js');
await writeFile('dist/server/studio.js',(await read('server/studio.js')).replace('../web/placement.js','./placement.js'));

const files=['index.html','app.js','render3d.js','touch-pose.js','ik3d.js','placement.js','styles.css','icon.svg','manifest.webmanifest','sw.js'];
const assets=Object.fromEntries(await Promise.all(files.map(async name=>[name,await read('web/'+name)])));
assets['index.html']=assets['index.html'].replace('<head>','<head><meta name="studio-host" content="chatgpt-sites">');
await writeFile('dist/server/assets.js','export default '+JSON.stringify(assets)+';\n');
