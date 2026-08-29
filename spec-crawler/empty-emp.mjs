import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
for (const [route,slug] of [['all','emp-all'],['backlog','emp-backlog'],['active','emp-active']]) {
  await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/EMP/'+route}); await sleep(5000);
  const dump = await evalJs(`(()=>{
    const els=[...document.querySelectorAll('*')].filter(e=>{
      const r=e.getBoundingClientRect();
      return r.x>300&&r.y>150&&r.width>200&&r.width<700&&r.height>80&&r.height<560&&e.children.length<=8&&e.textContent.trim().length>10;
    }).map(e=>{
      const r=e.getBoundingClientRect();
      return {tag:e.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,svg:!!e.querySelector('svg'),txt:e.textContent.replace(/\\s+/g,' ').slice(0,140),btns:[...e.querySelectorAll('button')].map(b=>b.textContent.trim()).filter(Boolean).slice(0,4)};
    });
    return JSON.stringify(els.slice(0,6),null,0);
  })()`);
  console.log(route, '=>', dump);
  // extract illustration svg if present
  const svg = await evalJs(`(()=>{
    const s=[...document.querySelectorAll('svg')].find(s=>{const r=s.getBoundingClientRect();return r.x>350&&r.x<1000&&r.y>150&&r.width>60});
    return s?JSON.stringify({w:s.getBoundingClientRect().width|0,html:s.outerHTML}):null;
  })()`);
  if (svg) { const d=JSON.parse(svg); writeFileSync('assets/linear-icons/empty-'+slug+'-illustration.svg', d.html); console.log('  svg saved', d.w, d.html.length); }
}
ws.close();
