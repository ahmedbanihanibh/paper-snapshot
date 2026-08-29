// Drive the accelerator surfaces + measure optimistic status change.
import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});if(r.result?.exceptionDetails)console.error('EVAL ERR',JSON.stringify(r.result.exceptionDetails.text));return r.result?.result?.value};
const report={};

// ---- helpers in page
await evalJs(`window.__findRow = t => [...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes(t))`);
const cursorTo = async (frag) => {
  // click is navigation — use keyboard: jump cursor by pressing j repeatedly until row has data-keyboard-active
  for(let i=0;i<40;i++){
    const done = await evalJs(`(()=>{const r=window.__findRow(${JSON.stringify(frag)});return r?r.getAttribute('data-keyboard-active'):'missing'})()`);
    if(done==='true')return true;
    if(done==='missing')return false;
    await key('j','KeyJ',74); await sleep(120);
  }
  return false;
};
const readOverlay = async () => evalJs(`(()=>{
  const pops=[...document.querySelectorAll('body > div')].filter(d=>{
    const r=d.getBoundingClientRect(); const cs=getComputedStyle(d);
    return r.width>100&&r.height>60&&(cs.position==='fixed'||cs.position==='absolute')&&d.querySelector('[role="listbox"],[role="menu"],input');
  });
  const p=pops[pops.length-1]; if(!p)return null;
  const inner=p.querySelector('[role="listbox"],[role="menu"]')||p;
  const surf=(()=>{let el=inner;for(let i=0;i<5&&el;i++,el=el.parentElement){const cs=getComputedStyle(el);if(cs.backgroundColor!=='rgba(0, 0, 0, 0)')return {bg:cs.backgroundColor,radius:cs.borderRadius,border:cs.border,shadow:cs.boxShadow.slice(0,120)};}return null})();
  const items=[...inner.querySelectorAll('[role="option"],[role="menuitem"]')].map(li=>{
    const r=li.getBoundingClientRect();
    const kbd=[...li.querySelectorAll('kbd,[class*="shortcut"]')].map(k=>k.textContent).join('');
    return {t:li.textContent.slice(0,60),h:Math.round(r.height),kbd};
  });
  const input=p.querySelector('input');
  const r=p.getBoundingClientRect();
  return {rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},surf,hasSearch:!!input,placeholder:input?.placeholder||null,items:items.slice(0,30),itemCount:items.length};
})()`);

// ---- A. cursor to seeded row #1 and open each accelerator surface
console.log('cursor to SNMP walk row:', await cursorTo('Add SNMP walk caching'));

// S = status
await key('s','KeyS',83); await sleep(700);
report.statusMenu = await readOverlay();
await key('Escape','Escape',27); await sleep(400);
// P = priority
await key('p','KeyP',80); await sleep(700);
report.priorityMenu = await readOverlay();
await key('Escape','Escape',27); await sleep(400);
// A = assignee
await key('a','KeyA',65); await sleep(700);
report.assigneeMenu = await readOverlay();
await key('Escape','Escape',27); await sleep(400);
// L = labels
await key('l','KeyL',76); await sleep(700);
report.labelsMenu = await readOverlay();
await key('Escape','Escape',27); await sleep(400);

// ---- B. THE optimistic measurement: set status In Progress, watch DOM vs network
await evalJs(`(()=>{
  window.__m={domMoved:null,netDone:null,t0:null,muts:0};
  const list=document.querySelector('a[href*="/issue/"]').closest('[class]').parentElement.parentElement;
  const row=window.__findRow('Add SNMP walk caching');
  const startGroupY=row.getBoundingClientRect().y;
  window.__m.startY=startGroupY;
  const mo=new MutationObserver(()=>{window.__m.muts++;
    const r=window.__findRow('Add SNMP walk caching');
    if(r&&window.__m.domMoved===null&&Math.abs(r.getBoundingClientRect().y-startGroupY)>20)window.__m.domMoved=performance.now();
  });
  mo.observe(document.body,{childList:true,subtree:true});
  const po=new PerformanceObserver(l=>{for(const e of l.getEntries()){if(/graphql|linear\\.app.*sync|mutation/i.test(e.name)&&window.__m.t0&&e.startTime>window.__m.t0&&window.__m.netDone===null)window.__m.netDone=e.responseEnd}});
  po.observe({entryTypes:['resource']});
  return 'armed at y='+startGroupY;
})()`).then(v=>console.log('instrument:',v));
await key('s','KeyS',83); await sleep(700);
// type to filter to "In Progress", then Enter
await send('Input.insertText',{text:'in prog'}); await sleep(400);
await evalJs(`window.__m.t0=performance.now()`);
await key('Enter','Enter',13); await sleep(80);
const early = await evalJs(`JSON.stringify({domMoved:window.__m.domMoved,t0:window.__m.t0,muts:window.__m.muts})`);
await sleep(2500);
const late = await evalJs(`JSON.stringify(window.__m)`);
report.optimistic = {early:JSON.parse(early), late:JSON.parse(late)};
console.log('OPTIMISTIC:', early, '->', late);

ws.close();
writeFileSync('/tmp/interactivity-report.json', JSON.stringify(report,null,1));
console.log('WROTE /tmp/interactivity-report.json');
