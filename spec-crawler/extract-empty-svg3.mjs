import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const svg = await evalJs(`(()=>{
  const s=[...document.querySelectorAll('svg')].find(s=>{const r=s.getBoundingClientRect();return Math.abs(r.x-444)<6&&Math.abs(r.y-253)<6});
  return s?s.outerHTML:null;
})()`);
if (!svg) { console.log('no svg'); process.exit(1); }
writeFileSync('assets/linear-icons/empty-cycle-illustration.svg', svg);
console.log('saved', svg.length, 'bytes; preview:', svg.slice(0,200));
ws.close();
