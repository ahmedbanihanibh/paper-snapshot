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
// composer is already open from previous 'c'
const pills = await evalJs(`(()=>{
  const panel=[...document.querySelectorAll('div')].find(d=>{const r=d.getBoundingClientRect();return r.width>600&&r.width<900&&r.height>150&&r.height<600&&r.y>50});
  if(!panel)return null; window.__dlg=panel;
  const b=panel.getBoundingClientRect();
  const btns=[...panel.querySelectorAll('button')].map(x=>{const r=x.getBoundingClientRect();return {t:(x.textContent.replace(/\\s+/g,' ').trim()||x.getAttribute('aria-label')||'').slice(0,22),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}).filter(x=>x.w>0);
  return JSON.stringify({dlg:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},btns});
})()`);
console.log('composer:', pills);
if (!pills) { console.log('not open — abort'); ws.close(); process.exit(1); }
const {btns} = JSON.parse(pills);
const seen=new Set();
const out={};
for (const t of btns) {
  const label=(t.t||'').trim();
  if (!/^(Todo|Backlog|Priority|Assignee|Labels|Project|Cycle|More|No priority)/i.test(label) || seen.has(label)) continue;
  seen.add(label);
  await click(t.x+t.w/2, t.y+t.h/2); await sleep(900);
  const ov = await evalJs(`(()=>{
    const cands=[...document.querySelectorAll('div')].filter(e=>{
      const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
      return r.width>150&&r.width<500&&r.height>60&&r.height<600&&(cs.position==='fixed'||cs.position==='absolute')&&cs.zIndex!=='auto'&&!window.__dlg.contains(e)&&e.textContent.trim();
    });
    const m=cands[cands.length-1]; if(!m)return '(none)';
    const b=m.getBoundingClientRect();
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},txt:m.textContent.replace(/\\s+/g,' ').slice(0,120)});
  })()`);
  out[label]=ov;
  console.log(label,'->',String(ov).slice(0,200));
  await key('Escape','Escape',27); await sleep(500);
}
ws.close();
