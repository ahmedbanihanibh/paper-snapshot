import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};

const pt = JSON.parse(await evalJs(`(()=>{const r=[...document.querySelectorAll('a[href*="/issue/"]')][1];const b=r.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22})})()`));
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pt.x,y:pt.y,button:'right',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x,y:pt.y,button:'right',clickCount:1});
await sleep(900);
const row = await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<400&&r.height>300});
  const m=cand[cand.length-1]; if(!m)return null; window.__menu=m;
  const rows=[...m.querySelectorAll('div,button,a,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>24&&r.height<40&&r.width>150});
  const all=rows.map(x=>({t:x.textContent.replace(/\\s+/g,' ').slice(0,30),y:Math.round(x.getBoundingClientRect().y),x:Math.round(x.getBoundingClientRect().x),h:Math.round(x.getBoundingClientRect().height)}));
  const rem=all.find(r=>/^Remove/.test(r.t));
  return JSON.stringify({rem, labels:[...new Set(all.map(a=>a.t))]});
})()`);
console.log(row);
const parsed = JSON.parse(row);
if (parsed.rem) {
  const it = parsed.rem;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:it.x+50,y:it.y+it.h/2}); await sleep(900);
  console.log('REMOVE SUB:', await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>120&&r.width<450&&r.height>40&&e!==window.__menu&&!window.__menu.contains(e)});
    const sub=cand[cand.length-1]; if(!sub)return '(none)';
    const b=sub.getBoundingClientRect();
    const rows=[...sub.querySelectorAll('div,button,a,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>22&&r.height<40&&r.width>100}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,50));
    const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){seen.add(t);uniq.push(t);}}
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq});
  })()`));
}
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(300);
console.log('final path:', await evalJs('location.pathname'));
ws.close();
