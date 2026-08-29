// Extract every SVG icon on the current Linear page, deduped by path signature.
import WebSocket from 'ws';
import { writeFileSync, mkdirSync } from 'node:fs';
const OUT = new URL('./assets/linear-icons/', import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d.result)}};ws.on('message',h)});
const expr = `(()=>{
  const svgs=[...document.querySelectorAll('svg')];
  const seen=new Map();
  for(const s of svgs){
    const outer=s.outerHTML;
    const sig=outer.replace(/\\s+/g,'').slice(0,4000);
    if(seen.has(sig))continue;
    // context: nearest labelled ancestor
    let ctx='';
    let el=s;
    for(let i=0;i<6&&el;i++,el=el.parentElement){
      const l=el.getAttribute&&(el.getAttribute('aria-label')||el.getAttribute('data-tooltip')||el.getAttribute('alt'));
      if(l){ctx=l;break}
    }
    if(!ctx){
      const row=s.closest('a[href]');
      if(row)ctx='in:'+(row.getAttribute('href')||'').slice(0,40);
    }
    const r=s.getBoundingClientRect();
    seen.set(sig,{outer,ctx,w:r.width,h:r.height,cls:s.getAttribute('class')||''});
  }
  return JSON.stringify([...seen.values()]);
})()`;
const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true});
const icons = JSON.parse(r.result.value);
const slug = s => (s||'unnamed').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,50)||'unnamed';
const counts = {};
const index = [];
for(const ic of icons){
  let name = slug(ic.ctx);
  counts[name]=(counts[name]||0)+1;
  if(counts[name]>1) name += '-'+counts[name];
  const file = name + '.svg';
  writeFileSync(OUT+file, ic.outer);
  index.push({file, ctx: ic.ctx, w: ic.w, h: ic.h});
}
writeFileSync(OUT+'_index.json', JSON.stringify(index,null,1));
console.log(`extracted ${icons.length} unique svgs -> ${OUT}`);
console.log(index.map(i=>`${i.file}  (${i.w}x${i.h})  ${i.ctx}`).join('\n'));
ws.close();
