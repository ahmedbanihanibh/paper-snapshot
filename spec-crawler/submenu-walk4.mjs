import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)return 'EX: '+(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value};

const info = JSON.parse(await evalJs(`(()=>{
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<500});
  const r=rows[1]; const b=r.getBoundingClientRect();
  return JSON.stringify({x:b.x,y:b.y,h:b.height,label:r.textContent.slice(0,30)});
})()`));
console.log('target:', info);
const cx=info.x+300, cy=info.y+info.h/2;
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy}); await sleep(400);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'right',clickCount:1,buttons:2});
await sleep(60);
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'right',clickCount:1,buttons:0});
await sleep(1200);
const top = await evalJs(`(()=>{
  const menus=[...document.querySelectorAll('[role="menu"]')];
  if(!menus.length)return 'NO MENU';
  const m=menus[0]; const mr=m.getBoundingClientRect();
  const items=[...m.querySelectorAll('[role="menuitem"]')].map(i=>{
    const r=i.getBoundingClientRect();
    return {t:i.textContent.replace(/\\s+/g,' ').slice(0,44), x:Math.round(r.x), y:Math.round(r.y), h:Math.round(r.height), sub:i.getAttribute('aria-haspopup')||''};
  });
  return JSON.stringify({menu:{x:Math.round(mr.x),y:Math.round(mr.y),w:Math.round(mr.width),h:Math.round(mr.height)},items});
})()`);
console.log('TOP:', top);
if (top === 'NO MENU') { ws.close(); process.exit(1); }
const {items} = JSON.parse(top);
const out = {};
for (const it of items) {
  if (!it.sub && !/Mark as|Remove|Copy|Convert|Move|Open in|Create related|More properties|Remind/.test(it.t)) continue;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:it.x+60,y:it.y+it.h/2}); await sleep(850);
  out[it.t] = await evalJs(`(()=>{
    const menus=[...document.querySelectorAll('[role="menu"],[role="listbox"]')];
    if(menus.length<2)return '(none)';
    const sub=menus[menus.length-1]; const r=sub.getBoundingClientRect();
    const rows=[...sub.querySelectorAll('[role="menuitem"],[role="option"]')].map(i=>{
      const b=i.getBoundingClientRect();
      return i.textContent.replace(/\\s+/g,' ').slice(0,52)+' ['+Math.round(b.height)+'px]';
    });
    return JSON.stringify({rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},rows});
  })()`);
}
console.log('SUBMENUS:', JSON.stringify(out, null, 1));
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(400);
console.log('final path:', await evalJs('location.pathname'));
ws.close();
