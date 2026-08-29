import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
console.log(await evalJs(`(()=>{
  const heads=[...document.querySelectorAll('div')].filter(d=>{const r=d.getBoundingClientRect();return r.x>240&&r.x<340&&r.height>20&&r.height<40&&/^(In Progress|Todo|Backlog|In Review|Done|Canceled|Duplicate)\\d*$/.test(d.textContent.replace(/\\s+/g,''))});
  const seen=new Set();
  const hs=heads.map(h=>{const r=h.getBoundingClientRect();return {t:h.textContent.replace(/\\s+/g,' ').trim(),y:Math.round(r.y)}}).filter(h=>{const k=h.t+h.y;if(seen.has(k))return false;seen.add(k);return true});
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')].map(a=>Math.round(a.getBoundingClientRect().y));
  return JSON.stringify({headers:hs, rowYs:rows.slice(0,25)});
})()`));
ws.close();
