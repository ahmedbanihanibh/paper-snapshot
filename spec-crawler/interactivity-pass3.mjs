import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('EVAL ERR:',(r.result.exceptionDetails.exception?.description||'').slice(0,200));return r.result?.result?.value};

const hoverRow = async (frag) => {
  const v = await evalJs(`(()=>{const el=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes(${JSON.stringify(frag)}));if(!el)return null;el.scrollIntoView({block:'center'});const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22,href:el.getAttribute('href')})})()`);
  if(!v)return null;
  const pt=JSON.parse(v);
  await sleep(250);
  // re-read after scroll settle
  const v2 = await evalJs(`(()=>{const el=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes(${JSON.stringify(frag)}));const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22})})()`);
  const p2=JSON.parse(v2);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p2.x,y:p2.y});
  await sleep(350);
  return pt.href;
};
const readPalette = () => evalJs(`(()=>{
  const lb=document.querySelector('[role="listbox"]'); if(!lb)return null;
  let surf=null,el=lb;
  for(let i=0;i<8&&el;i++,el=el.parentElement){const cs=getComputedStyle(el);if(cs.backgroundColor!=='rgba(0, 0, 0, 0)'){surf={bg:cs.backgroundColor,radius:cs.borderRadius,shadow:cs.boxShadow.slice(0,150)};break}}
  const items=[...lb.querySelectorAll('[role="option"]')].map(li=>({t:li.textContent.replace(/\\s+/g,' ').slice(0,55),h:Math.round(li.getBoundingClientRect().height)}));
  const input=document.activeElement?.tagName==='INPUT'?document.activeElement:null;
  const b=lb.getBoundingClientRect();
  // context line above input?
  const ctx=[...document.querySelectorAll('div,span')].find(d=>/TES-\\d+ ⋅|TES-\\d+ ·/.test(d.textContent)&&d.getBoundingClientRect().height<40&&d.getBoundingClientRect().height>0);
  return {rect:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)},surf,placeholder:input?.placeholder||null,ctx:ctx?ctx.textContent.slice(0,60):null,itemCount:items.length,items:items.slice(0,20)};
})()`);

const report={};
const setProp = async (frag, accel, code, kc, filter, expectClose=true) => {
  const href = await hoverRow(frag);
  if(!href){console.log('ROW NOT FOUND:',frag);return null}
  await key(accel,code,kc); await sleep(800);
  const pal = await readPalette();
  if(!pal){console.log('no palette for',accel,'on',frag);return null}
  if(filter){ await send('Input.insertText',{text:filter}); await sleep(450); }
  const after = await readPalette();
  await key('Enter','Enter',13); await sleep(900);
  const closed = await evalJs(`!document.querySelector('[role="listbox"]')`);
  console.log(`${frag.slice(0,25)} ${accel}${filter?'→'+filter:''}: ${after?.itemCount} matches, applied=${closed}`);
  return {opened:pal, filtered:after};
};

// capture the four surfaces on the first seeded row (open, read, no filter, escape once for the pure capture)
const href1 = await hoverRow('Add SNMP walk caching');
console.log('target:', href1);
for(const [name,k,code,kc] of [['status','s','KeyS',83],['priority','p','KeyP',80],['assignee','a','KeyA',65],['labels','l','KeyL',76]]){
  await hoverRow('Add SNMP walk caching');
  await key(k,code,kc); await sleep(800);
  report[name] = await readPalette();
  console.log(name+':', report[name]?`${report[name].itemCount} items, ph="${report[name].placeholder}", ctx="${report[name].ctx}"`:'MISSING');
  await key('Escape','Escape',27); await sleep(400);
  const path = await evalJs('location.pathname');
  if(!path.endsWith("/all")){ await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'}); await sleep(5000); }
}
report.escapeFromPaletteNavigates = await evalJs('location.pathname');

// ---- optimistic measurement on the status change
await hoverRow('Add SNMP walk caching');
await evalJs(`(()=>{
  window.__m={domMoved:null,firstNet:null,t0:null,muts:0};
  const target=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes('Add SNMP walk caching'));
  const y0=target.getBoundingClientRect().y; window.__m.y0=y0;
  const mo=new MutationObserver(()=>{window.__m.muts++;
    if(window.__m.t0===null)return;
    const r=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes('Add SNMP walk caching'));
    if(r&&window.__m.domMoved===null&&Math.abs(r.getBoundingClientRect().y-y0)>20)window.__m.domMoved=performance.now()-window.__m.t0;
  });
  mo.observe(document.body,{childList:true,subtree:true,attributes:true,attributeFilter:['data-selected','aria-label']});
  const po=new PerformanceObserver(l=>{for(const e of l.getEntries()){if(window.__m.t0!==null&&/graphql/i.test(e.name)&&window.__m.firstNet===null&&e.startTime>window.__m.t0Abs)window.__m.firstNet=e.responseEnd-window.__m.t0Abs}});
  po.observe({entryTypes:['resource']});
  return 'armed y0='+y0;
})()`).then(v=>console.log('instrument:',v));
await key('s','KeyS',83); await sleep(700);
await send('Input.insertText',{text:'in prog'}); await sleep(400);
await evalJs(`(()=>{window.__m.t0Abs=performance.now();window.__m.t0=window.__m.t0Abs;return 'go'})()`);
await key('Enter','Enter',13);
await sleep(120);
report.optimisticEarly = JSON.parse(await evalJs(`JSON.stringify(window.__m)`)||'{}');
await sleep(2500);
report.optimisticLate = JSON.parse(await evalJs(`JSON.stringify(window.__m)`)||'{}');
console.log('OPTIMISTIC early:',JSON.stringify(report.optimisticEarly));
console.log('OPTIMISTIC late :',JSON.stringify(report.optimisticLate));

// ---- property spread across the other seeded issues
await setProp('Add SNMP walk caching','p','KeyP',80,'urgent');
await setProp('Add SNMP walk caching','a','KeyA',65,'ahmed');
await setProp('Param 1001 shows stale','s','KeyS',83,'in prog');
await setProp('Param 1001 shows stale','p','KeyP',80,'high');
await setProp('Table column widths','s','KeyS',83,'todo');
await setProp('Table column widths','p','KeyP',80,'medium');
await setProp('QAction compile diagnostics','s','KeyS',83,'todo');
await setProp('QAction compile diagnostics','p','KeyP',80,'high');
await setProp('Add dark-mode support','p','KeyP',80,'low');
await setProp('Write onboarding doc','s','KeyS',83,'todo');
await setProp('Investigate flaky trap','p','KeyP',80,'medium');
await setProp('Ship version bump','s','KeyS',83,'done');
await setProp('Spike: Rust engine','s','KeyS',83,'cancel');
// one in review for the icon
await setProp('Param 1001 shows stale','s','KeyS',83,'review');

writeFileSync('/tmp/accel-report.json', JSON.stringify(report,null,1));
console.log('WROTE /tmp/accel-report.json');
ws.close();
