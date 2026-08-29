import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
console.log('url:', await evalJs('location.href'));
// the empty block at 444,253 — what's inside its top 80px?
console.log(await evalJs(`(()=>{
  const block=[...document.querySelectorAll('div')].find(d=>{const r=d.getBoundingClientRect();return Math.abs(r.x-444)<6&&Math.abs(r.y-253)<6&&r.height>200});
  if(!block)return 'no block';
  const top=[...block.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.y<340}).map(e=>{
    const r=e.getBoundingClientRect();
    return {tag:e.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,src:(e.getAttribute&&(e.getAttribute('src')||e.getAttribute('style')||'')).toString().slice(0,120)};
  });
  return JSON.stringify(top.slice(0,12),null,0);
})()`));
ws.close();
