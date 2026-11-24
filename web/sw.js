// App-shell caching only. Never cache API or MCP responses, credentials or medical case data.
const CACHE='osce-playground-shell-v11';
const SHELL=['/','/index.html','/styles.css','/app.js','/render3d.js','/touch-pose.js','/ik3d.js','/placement.js','/assembly.js','/optimistic.js','/learning.js','/spatial.js','/scene-delta.js','/coupling.js','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
 const req=event.request; if(req.method!=='GET')return;const url=new URL(req.url);
 if(url.origin!==self.location.origin||url.pathname.startsWith('/api/')||url.pathname==='/mcp'||url.pathname==='/health'||url.pathname==='/widget')return;
 event.respondWith(fetch(req).catch(()=>caches.match(req)));
});
