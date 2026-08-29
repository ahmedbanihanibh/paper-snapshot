import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const svg = await evalJs(`(()=>{
  const cands=[...document.querySelectorAll('svg')].filter(s=>{const r=s.getBoundingClientRect();return r.x>400&&r.x<900&&r.y>200&&r.width>100});
  const s=cands[0]; if(!s)return null;
  const r=s.getBoundingClientRect();
  return JSON.stringify({w:r.width,h:r.height,html:s.outerHTML});
})()`);
if (!svg) { console.log('no svg'); process.exit(1); }
const d = JSON.parse(svg);
writeFileSync('assets/linear-icons/empty-cycle-illustration.svg', d.html);
console.log('saved empty-cycle-illustration.svg', d.w+'x'+d.h, d.html.length, 'bytes');
ws.close();
