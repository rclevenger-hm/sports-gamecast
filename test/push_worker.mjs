import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const handlers={};
const shown=[];
const opened=[];
let focused=0;
const self={
  location:{href:'https://example.test/sports-gamecast/sw.js',origin:'https://example.test'},
  registration:{showNotification:async(title,options)=>shown.push({title,options})},
  clients:{
    claim:async()=>{},
    matchAll:async()=>[],
    openWindow:async url=>{opened.push(url);return{url};},
  },
  skipWaiting:async()=>{},
  addEventListener:(type,handler)=>{handlers[type]=handler;},
};
const sandbox={self,URL,caches:{},fetch:async()=>{throw new Error('not used');}};
vm.runInNewContext(fs.readFileSync('../sw.js','utf8'),sandbox,{filename:'sw.js'});

assert.equal(typeof handlers.push,'function','service worker should register a push handler');
assert.equal(typeof handlers.notificationclick,'function','service worker should register a notification click handler');

let pending;
handlers.push({
  data:{json:()=>({title:'Lead change',body:'Chargers take the lead',tag:'game-42:lead',url:'./gamecast.html?event=42'})},
  waitUntil:value=>{pending=value;},
});
await pending;
assert.equal(shown.length,1,'push should display one notification');
assert.equal(shown[0].title,'Lead change');
assert.equal(shown[0].options.body,'Chargers take the lead');
assert.equal(shown[0].options.tag,'game-42:lead');
assert.equal(shown[0].options.data.url,'https://example.test/sports-gamecast/gamecast.html?event=42');
assert.equal(shown[0].options.icon,'./app-icon.svg');

handlers.push({
  data:{json:()=>({title:'Unsafe target',url:'https://malicious.example/phish'})},
  waitUntil:value=>{pending=value;},
});
await pending;
assert.equal(shown[1].options.data.url,'https://example.test/sports-gamecast/','cross-origin targets must fall back to the app shell');

handlers.push({
  data:{json:()=>{throw new Error('bad payload');}},
  waitUntil:value=>{pending=value;},
});
await pending;
assert.equal(shown[2].title,'Sports Gamecast','malformed push data should degrade to a safe notification');

self.clients.matchAll=async()=>[{url:'https://example.test/sports-gamecast/gamecast.html?event=42',focus:async()=>{focused+=1;}}];
let closed=false;
handlers.notificationclick({
  notification:{data:{url:'./gamecast.html?event=42'},close:()=>{closed=true;}},
  waitUntil:value=>{pending=value;},
});
await pending;
assert.equal(closed,true,'click handler should close the notification');
assert.equal(focused,1,'an existing matching app window should be focused');
assert.equal(opened.length,0,'matching client should avoid opening a duplicate window');

self.clients.matchAll=async()=>[];
handlers.notificationclick({
  notification:{data:{url:'https://malicious.example/'},close:()=>{}},
  waitUntil:value=>{pending=value;},
});
await pending;
assert.equal(opened.at(-1),'https://example.test/sports-gamecast/','notification clicks must never navigate to a cross-origin payload target');

console.log('Push worker behavior validated.');
