const CACHE='vasuki-nfc-v4-prod-v1';
self.addEventListener('install',e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(['./','index.html','css/style.css'])))});
self.addEventListener('fetch',e=>{e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request)))})
