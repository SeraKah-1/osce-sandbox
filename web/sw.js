const CACHE='osce-static-v02';
const FILES=['/','/index.html','/styles.css','/app.js','/render3d.js','/icon.svg','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES))));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k))))));
self.addEventListener('fetch',event=>{const u=new URL(event.request.url);if(u.origin!==location.origin||u.pathname.startsWith('/api/')||u.pathname==='/mcp'||u.pathname==='/health')return;event.respondWith(fetch(event.request).catch(()=>caches.match(event.request)));});
