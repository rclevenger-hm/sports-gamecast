const CACHE='gamecast-shell-v1';
const SHELL=['./','./index.html','./gamecast.html','./ticker.html','./gamebar.html','./favorites.js','./notifications.js','./sport-visuals.js','./listen-live.js','./manifest.webmanifest','./app-icon.svg'];
const DEFAULT_NOTIFICATION_TITLE='Sports Gamecast';

function safeNotificationTarget(rawUrl){
  const fallback=new URL('./',self.location.href).href;
  try{
    const target=new URL(rawUrl||'./',self.location.href);
    return target.origin===self.location.origin?target.href:fallback;
  }catch{
    return fallback;
  }
}

function readPushPayload(event){
  if(!event.data)return{};
  try{return event.data.json()||{};}catch{return{};}
}

self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  const url=new URL(event.request.url);
  if(url.origin!==self.location.origin) return;
  event.respondWith(fetch(event.request).then(response=>{
    const copy=response.clone();
    caches.open(CACHE).then(cache=>cache.put(event.request,copy));
    return response;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html'))));
});

self.addEventListener('push',event=>{
  const payload=readPushPayload(event);
  const title=typeof payload.title==='string'&&payload.title.trim()?payload.title.trim():DEFAULT_NOTIFICATION_TITLE;
  const body=typeof payload.body==='string'?payload.body:'';
  const tag=typeof payload.tag==='string'&&payload.tag.trim()?payload.tag.trim():undefined;
  const target=safeNotificationTarget(payload.url);
  event.waitUntil(self.registration.showNotification(title,{
    body,
    tag,
    icon:'./app-icon.svg',
    badge:'./app-icon.svg',
    data:{url:target},
  }));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=safeNotificationTarget(event.notification?.data?.url);
  event.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(windowClients=>{
    const existing=windowClients.find(client=>client.url===target);
    if(existing&&typeof existing.focus==='function')return existing.focus();
    if(typeof self.clients.openWindow==='function')return self.clients.openWindow(target);
    return undefined;
  }));
});
