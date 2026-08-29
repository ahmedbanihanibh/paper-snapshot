import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('EVAL ERR:',r.result.exceptionDetails.exception?.description?.slice(0,200)||'?');return r.result?.result?.value};

await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6000);

// scroll the list to load everything (virtua) and find a seeded row
const found = await evalJs(`(async()=>{
  const scroller=[...document.querySelectorAll('div')].find(d=>{const cs=getComputedStyle(d);return (cs.overflowY==='auto'||cs.overflowY==='scroll')&&d.scrollHeight>d.clientHeight+50&&d.querySelector('a[href*="/issue/"]')});
  if(!scroller)return 'no scroller';
  window.__scroller=scroller;
  for(let y=0;y<=scroller.scrollHeight;y+=400){
    scroller.scrollTop=y; await new Promise(r=>setTimeout(r,120));
    const row=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes('Add SNMP walk caching'));
    if(row){row.scrollIntoView({block:'center'});await new Promise(r=>setTimeout(r,300));return 'found: '+row.getAttribute('href')}
  }
  return 'not found after full scroll; scrollHeight='+scroller.scrollHeight;
})()`);
console.log('scroll search:', found);
if(!/^found/.test(found)){ws.close();process.exit(1)}

const rowSel = `[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes('Add SNMP walk caching'))`;
// put keyboard cursor on it: hover it with a real mouse move (sets data-active), then keyboard ops act on... 
// NO — cursor follows hover in Linear? data-active is hover; keyboard cursor is separate. Accelerators act on the CURSOR row.
// Reliable route: real mouse move onto the row, then press S — Linear's context target follows the pointer row (palette context followed cursor; accelerators use the same context target).
const r = await evalJs(`(()=>{const el=${rowSel};const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+b.height/2})})()`);
const pt = JSON.parse(r);
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
await sleep(450);
console.log('row state after hover:', await evalJs(`(()=>{const el=${rowSel};return JSON.stringify({active:el.getAttribute('data-active'),kb:el.getAttribute('data-keyboard-active')})})()`));

const readOverlay = () => evalJs(`(()=>{
  const cand=[...document.querySelectorAll('body > div, body > div > div')].filter(d=>{
    const r=d.getBoundingClientRect(); const cs=getComputedStyle(d);
    return r.width>150&&r.height>80&&r.width<800&&(cs.position==='fixed'||cs.position==='absolute')&&d.querySelector('[role="listbox"],[role="menu"]');
  });
  const p=cand[cand.length-1]; if(!p)return null;
  const inner=p.querySelector('[role="listbox"],[role="menu"]');
  let surf=null,el=inner;
  for(let i=0;i<6&&el;i++,el=el.parentElement){const cs=getComputedStyle(el);if(cs.backgroundColor!=='rgba(0, 0, 0, 0)'){surf={bg:cs.backgroundColor,radius:cs.borderRadius,border:cs.border.slice(0,60),shadow:cs.boxShadow.slice(0,150)};break}}
  const items=[...inner.querySelectorAll('[role="option"],[role="menuitem"]')].map(li=>{
    const r=li.getBoundingClientRect();
    const kbd=[...li.querySelectorAll('kbd,[class*="hortcut"],[class*="Kbd"]')].map(k=>k.textContent).join(' ');
    return {t:li.textContent.replace(/\\s+/g,' ').slice(0,55),h:Math.round(r.height),kbd:kbd||undefined};
  });
  const input=p.querySelector('input');
  const b=p.getBoundingClientRect();
  return {rect:{x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)},surf,hasSearch:!!input,placeholder:input?.placeholder||null,itemCount:items.length,items:items.slice(0,25)};
})()`);

const report={};
for(const [name,k,code,kc] of [['status','s','KeyS',83],['priority','p','KeyP',80],['assignee','a','KeyA',65],['labels','l','KeyL',76]]){
  await key(k,code,kc); await sleep(800);
  report[name]=await readOverlay();
  console.log(name+':', report[name]?`${report[name].itemCount} items, search=${report[name].hasSearch}`:'NO OVERLAY');
  await key('Escape','Escape',27); await sleep(500);
  // Escape from a MENU should close menu only, not navigate — verify we're still on /all
  const path=await evalJs('location.pathname');
  if(!/all$/.test(path)){console.log('ESCAPE NAVIGATED to',path,'— going back');await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});await sleep(5000);
    await evalJs(`(async()=>{const row=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes('Add SNMP walk caching'));if(row)row.scrollIntoView({block:'center'})})()`);await sleep(500);
    await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});await sleep(400);}
}
writeFileSync('/tmp/accel-menus.json', JSON.stringify(report,null,1));
console.log('WROTE /tmp/accel-menus.json');
ws.close();
