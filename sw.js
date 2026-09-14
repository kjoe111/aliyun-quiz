const CACHE='aliyun-quiz-v6';
const ASSETS=['./','./index.html','./manifest.webmanifest','./icon-192.png','./icon-512.png','./sync-fix.js'];

async function injectSyncFix(resp){
  if(!resp)return resp;
  const type=resp.headers.get('content-type')||'';
  if(!type.includes('text/html'))return resp;
  const text=await resp.text();
  const tag='<script src="./sync-fix.js?v=6"></script>';
  const body=text.includes(tag)?text:text.replace('</body>',tag+'</body>');
  const headers=new Headers(resp.headers);
  headers.delete('content-length');
  return new Response(body,{status:resp.status,statusText:resp.statusText,headers});
}

self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE&&k!=='aliyun-quiz-question-data-v1').map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{
  if(e.request.method!=='GET')return;
  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const net=await fetch(e.request,{cache:'no-store'});
        if(net.ok){const raw=net.clone();caches.open(CACHE).then(c=>c.put('./index.html',raw));}
        return await injectSyncFix(net);
      }catch(err){
        return await injectSyncFix(await caches.match('./index.html'));
      }
    })());
    return;
  }
  e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(resp=>{if(resp.ok){const copy=resp.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));}return resp;})));
});
