import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(150);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'}); await sleep(6000);
await key('c','KeyC',67); await sleep(1200);
// composer panel + pill row
const pills = await evalJs(`(()=>{
  const dlg=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed').filter(e=>{const r=e.getBoundingClientRect();return r.width>600&&r.width<900&&r.height>150});
  const m=dlg[dlg.length-1]; if(!m)return null; window.__dlg=m;
  const btns=[...m.querySelectorAll('button')].map(b=>{const r=b.getBoundingClientRect();return {t:b.textContent.replace(/\\s+/g,' ').slice(0,20)||b.getAttribute('aria-label'),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}).filter(b=>b.w>0);
  const b=m.getBoundingClientRect();
  return JSON.stringify({dlg:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},btns});
})()`);
console.log('composer:', pills);
if (!pills) { ws.close(); process.exit(1); }
const {btns} = JSON.parse(pills);
const targets = btns.filter(b=>/Todo|Backlog|priority|Priority|Assignee|Assign|Labels|Project|Cycle|More/.test(b.t||''));
const out={};
for (const t of targets.slice(0,6)) {
  await click(t.x+t.w/2, t.y+t.h/2); await sleep(900);
  out[t.t] = await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<500&&r.height>60&&r.height<600&&e!==window.__dlg&&!window.__dlg.contains(e)});
    const m=cand[cand.length-1]; if(!m)return '(none)';
    const b=m.getBoundingClientRect();
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},txt:m.textContent.replace(/\\s+/g,' ').slice(0,130)});
  })()`);
  console.log(t.t, '->', String(out[t.t]).slice(0,200));
  await key('Escape','Escape',27); await sleep(500);
}
// close composer (Escape may prompt discard?)
await key('Escape','Escape',27); await sleep(600);
console.log('after close:', await evalJs(`(()=>{const f=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed').filter(e=>{const r=e.getBoundingClientRect();return r.width>300&&r.height>100});return f.length+' overlays, path='+location.pathname})()`));
ws.close();
