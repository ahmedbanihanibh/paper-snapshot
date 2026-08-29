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
const overlay=async()=>await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.width<900&&r.height>40&&r.height<700});
  const m=cand[cand.length-1]; if(!m)return 'none';
  const b=m.getBoundingClientRect();
  const rows=[...m.querySelectorAll('div,button,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>20&&r.height<42&&r.width>60}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,44));
  const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){seen.add(t);uniq.push(t);}}
  return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq.slice(0,14),active:document.activeElement?.getAttribute('placeholder')||document.activeElement?.tagName});
})()`);

// click the Todo VALUE segment
await click(350+28, 107+12); await sleep(1000);
const ov1 = await overlay();
console.log('after value click:', ov1);
if (ov1 !== 'none') {
  // click "In Progress" row via mouse (real event) — find row
  const rowPt = await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.width<900&&r.height>40});
    const m=cand[cand.length-1];
    const rows=[...m.querySelectorAll('div,button,[role]')].filter(x=>/In Progress/.test(x.textContent)&&x.getBoundingClientRect().height>20&&x.getBoundingClientRect().height<42);
    if(!rows.length)return null; const b=rows[0].getBoundingClientRect();
    return JSON.stringify({x:b.x+b.width/2,y:b.y+b.height/2});
  })()`);
  if (rowPt) { const p=JSON.parse(rowPt); await click(p.x,p.y); await sleep(800); }
  await key('Escape','Escape',27); await sleep(700);
  const band = await evalJs(`(()=>{
    const out=[]; for(const e of document.querySelectorAll('*')){const r=e.getBoundingClientRect();
      if(r.y>95&&r.y<135&&r.x>240&&r.x<900&&r.height>18&&r.height<28&&e.children.length<=4){const t=e.textContent.replace(/\\s+/g,' ').trim();if(t&&t.length<60)out.push({t,x:Math.round(r.x),w:Math.round(r.width),h:Math.round(r.height)});}}
    return JSON.stringify(out);
  })()`);
  console.log('chip after add:', band);
  const parts = JSON.parse(band);
  const op = parts.find(p=>/^is/.test(p.t)&&p.w<160);
  if (op) { await click(op.x+op.w/2, 107+12); await sleep(900); console.log('multi operator menu:', await overlay()); await key('Escape','Escape',27); }
}
await sleep(300); console.log('final path:', await evalJs('location.pathname'));
ws.close();
