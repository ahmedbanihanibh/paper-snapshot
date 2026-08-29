import WebSocket from 'ws';
import { writeFileSync } from 'node:fs';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('EVAL ERR:',(r.result.exceptionDetails.exception?.description||r.result.exceptionDetails.text||'').slice(0,200));return r.result?.result?.value};

await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6500);

const openMenu = async () => {
  const pt = JSON.parse(await evalJs(`(()=>{const r=[...document.querySelectorAll('a[href*="/issue/"]')][1];const b=r.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22})})()`));
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y}); await sleep(300);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pt.x,y:pt.y,button:'right',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x,y:pt.y,button:'right',clickCount:1});
  await sleep(900);
  return await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<400&&r.height>300});
    const m=cand[cand.length-1]; if(!m)return null;
    window.__menu=m;
    const items=[...m.querySelectorAll('*')].filter(x=>{const r=x.getBoundingClientRect();return r.height>24&&r.height<36&&r.width>150&&x.textContent.trim()&&!x.querySelector('*[style]')||false});
    // simpler: direct children rows
    const rows=[...m.querySelectorAll('[role],button,a,div')].filter(x=>{const r=x.getBoundingClientRect();return r.height>24&&r.height<40&&r.width>150}).map(x=>{
      const r=x.getBoundingClientRect();
      return {t:x.textContent.replace(/\\s+/g,' ').slice(0,40),x:Math.round(r.x),y:Math.round(r.y),h:Math.round(r.height)};
    });
    // dedupe by y
    const seen=new Set(); const uniq=[];
    for(const it of rows){ if(!seen.has(it.y)){seen.add(it.y);uniq.push(it);} }
    const b=window.__menu.getBoundingClientRect();
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},items:uniq});
  })()`);
};

const top = await openMenu();
if (!top) { console.log('NO MENU'); ws.close(); process.exit(1); }
const menu = JSON.parse(top);
console.log('MENU', JSON.stringify(menu.rect), menu.items.length, 'rows');

const SUBS = ['Status','Priority','Assignee','Due date','Labels','Project','Cycle','More properties','Create related','Mark as','Remove','Copy','Convert to','Move','Open in','Remind me'];
const out = {};
for (const it of menu.items) {
  const label = SUBS.find(s=>it.t.startsWith(s));
  if (!label || out[label] !== undefined) continue;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:it.x+50,y:it.y+it.h/2}); await sleep(850);
  out[label] = await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<450&&r.height>50&&e!==window.__menu&&!window.__menu.contains(e)&&!e.contains(window.__menu)});
    const sub=cand[cand.length-1]; if(!sub)return '(none)';
    const b=sub.getBoundingClientRect();
    const rows=[...sub.querySelectorAll('[role],button,a,div')].filter(x=>{const r=x.getBoundingClientRect();return r.height>22&&r.height<40&&r.width>120}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,50));
    const seen=new Set(); const uniq=[];
    for(const t of rows){ if(!seen.has(t)){seen.add(t);uniq.push(t);} }
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq});
  })()`);
  console.log('---', label, ':', String(out[label]).slice(0,400));
}
writeFileSync('submenu-results.json', JSON.stringify(out,null,1));
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(400);
console.log('final path:', await evalJs('location.pathname'));
ws.close();
