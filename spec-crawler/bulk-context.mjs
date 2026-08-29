import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('EVAL ERR:',(r.result.exceptionDetails.exception?.description||'').slice(0,300));return r.result?.result?.value};
const report={};

await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6000);

// hover row 1, x; j j, x; j, x  => 3 selected across whatever groups
const rowPt = async (idx) => JSON.parse(await evalJs(`(()=>{const r=[...document.querySelectorAll('a[href*="/issue/"]')][${idx}];const b=r.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22,id:(r.getAttribute('href')||'').split('/')[3]})})()`));
const p0=await rowPt(0);
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p0.x,y:p0.y}); await sleep(300);
await key('x','KeyX',88); await sleep(250);
await key('j','KeyJ',74); await sleep(150); await key('x','KeyX',88); await sleep(250);
await key('j','KeyJ',74); await sleep(150); await key('x','KeyX',88); await sleep(250);

// read bulk bar
report.bulkBar = await evalJs(`(()=>{
  const cands=[...document.querySelectorAll('div')].filter(d=>/selected/.test(d.textContent)&&d.getBoundingClientRect().height===44&&d.getBoundingClientRect().width<500);
  const bar=cands[cands.length-1]; if(!bar)return null;
  const b=bar.getBoundingClientRect(); const cs=getComputedStyle(bar);
  const btns=[...bar.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect();const c=getComputedStyle(x);return {t:x.textContent.slice(0,20)||x.getAttribute('aria-label'),w:Math.round(r.width),bg:c.backgroundColor,radius:c.borderRadius}});
  return {rect:{x:+b.x.toFixed(1),y:+b.y.toFixed(1),w:+b.width.toFixed(1),h:b.height},bg:cs.backgroundColor,radius:cs.borderRadius,shadow:cs.boxShadow.slice(0,150),label:bar.textContent.slice(0,30),buttons:btns};
})()`);
console.log('bulk bar:', JSON.stringify(report.bulkBar).slice(0,300));

// open Actions menu (the ⌘ button)
const actions = await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.includes('Actions'));if(!b)return null;const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
if(actions){
  const ap=JSON.parse(actions);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:ap.x,y:ap.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:ap.x,y:ap.y,button:'left',clickCount:1});
  await sleep(900);
  report.actionsMenu = await evalJs(`(()=>{
    const lb=document.querySelector('[role="listbox"],[role="menu"]'); if(!lb)return null;
    const items=[...lb.querySelectorAll('[role="option"],[role="menuitem"]')].map(li=>li.textContent.replace(/\\s+/g,' ').slice(0,55));
    const input=document.activeElement?.tagName==='INPUT'?document.activeElement.placeholder:null;
    const b=lb.getBoundingClientRect();
    return {rect:{w:Math.round(b.width),h:Math.round(b.height)},placeholder:input,itemCount:items.length,items:items.slice(0,40)};
  })()`);
  console.log('actions menu:', report.actionsMenu?report.actionsMenu.itemCount+' items, ph='+report.actionsMenu.placeholder:'MISSING');
  await key('Escape','Escape',27); await sleep(400);
}
// clear selection via Escape
await key('Escape','Escape',27); await sleep(400);

// ---- right-click context menu on a row
const p1=await rowPt(2);
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p1.x,y:p1.y}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p1.x,y:p1.y,button:'right',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p1.x,y:p1.y,button:'right',clickCount:1});
await sleep(900);
report.contextMenu = await evalJs(`(()=>{
  const menus=[...document.querySelectorAll('[role="menu"]')];
  const m=menus[menus.length-1]; if(!m)return null;
  let surf=null,el=m;
  for(let i=0;i<6&&el;i++,el=el.parentElement){const cs=getComputedStyle(el);if(cs.backgroundColor!=='rgba(0, 0, 0, 0)'){surf={bg:cs.backgroundColor,radius:cs.borderRadius,shadow:cs.boxShadow.slice(0,150)};break}}
  const items=[...m.querySelectorAll('[role="menuitem"]')].map(li=>{
    const sub=li.getAttribute('aria-haspopup')==='menu'||!!li.querySelector('[class*="chevron"],[class*="Chevron"]');
    const kbd=[...li.querySelectorAll('kbd')].map(k=>k.textContent).join('');
    return {t:li.textContent.replace(/\\s+/g,' ').slice(0,45),h:Math.round(li.getBoundingClientRect().height),sub,kbd:kbd||undefined};
  });
  const b=m.getBoundingClientRect();
  return {rect:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)},surf,itemCount:items.length,items};
})()`);
console.log('context menu:', report.contextMenu?report.contextMenu.itemCount+' items':'MISSING');
await key('Escape','Escape',27); await sleep(300);

writeFileSync('/tmp/bulk-context.json', JSON.stringify(report,null,1));
console.log('WROTE /tmp/bulk-context.json');
ws.close();
