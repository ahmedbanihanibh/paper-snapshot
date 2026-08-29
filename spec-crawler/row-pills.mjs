import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(200);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};

// anatomy of one row: enumerate button-like elements inside a row
const row = await evalJs(`(()=>{
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<500});
  const r=rows[0]; const rb=r.getBoundingClientRect();
  const parts=[...r.querySelectorAll('button,[role="button"],[aria-label],svg')].map(x=>{
    const b=x.getBoundingClientRect();
    return {tag:x.tagName,aria:x.getAttribute&&(x.getAttribute('aria-label')||''),x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)};
  }).filter(p=>p.w>0);
  return JSON.stringify({row:{x:Math.round(rb.x),y:Math.round(rb.y),w:Math.round(rb.width),h:Math.round(rb.height),href:r.getAttribute('href')},parts:parts.slice(0,15)});
})()`);
console.log('row anatomy:', row);
const parsed = JSON.parse(row);
// click the status icon (usually first svg/button after priority) — try each button-like part until an overlay opens
for (const p of parsed.parts.filter(p=>p.tag==='BUTTON'||p.aria)) {
  await click(p.x+p.w/2, p.y+p.h/2); await sleep(800);
  const ov = await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<900&&r.height>60&&r.height<600});
    const m=cand[cand.length-1]; if(!m)return null;
    const b=m.getBoundingClientRect();
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},txt:m.textContent.replace(/\\s+/g,' ').slice(0,150)});
  })()`);
  console.log('clicked', p.aria||p.tag, '@',p.x,p.y,'->', ov ? ov.slice(0,220) : 'no overlay; path='+await evalJs('location.pathname'));
  if (ov) { await key('Escape','Escape',27); await sleep(400); }
  const path = await evalJs('location.pathname');
  if (/\/issue\//.test(path)) { console.log('NAVIGATED to detail — going back'); await evalJs('history.back()'); await sleep(1500); }
}
ws.close();
