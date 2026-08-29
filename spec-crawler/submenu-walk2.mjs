import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r.result?.result?.value};

await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(7000);
console.log('path:', await evalJs('location.pathname'), 'links:', await evalJs(`document.querySelectorAll('a[href*="/issue/"]').length`));
const info = JSON.parse(await evalJs(`(()=>{const r=[...document.querySelectorAll('a[href*="/issue/"]')][1];const b=r.getBoundingClientRect();return JSON.stringify({x:b.x,y:b.y,h:b.height})})()`));
const cx = info.x+400, cy = info.y+info.h/2;
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'right',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'right',clickCount:1});
await sleep(1000);

// dump top-level menu with per-item rects + submenu markers
const top = await evalJs(`(()=>{
  const menus=[...document.querySelectorAll('[role="menu"]')];
  if(!menus.length)return 'NO MENU';
  const m=menus[0];
  const items=[...m.querySelectorAll('[role="menuitem"]')].map(i=>{
    const r=i.getBoundingClientRect();
    return {t:i.textContent.replace(/\\s+/g,' ').slice(0,40), x:Math.round(r.x), y:Math.round(r.y), w:Math.round(r.width), h:Math.round(r.height), sub:i.getAttribute('aria-haspopup')||i.getAttribute('aria-expanded')||''};
  });
  return JSON.stringify(items);
})()`);
console.log('TOP MENU:', top);
if (top === 'NO MENU') { ws.close(); process.exit(1); }
const items = JSON.parse(top);
const out = {};
for (const it of items.filter(i=>i.sub)) {
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:it.x+60,y:it.y+it.h/2}); await sleep(800);
  out[it.t] = await evalJs(`(()=>{
    const menus=[...document.querySelectorAll('[role="menu"],[role="listbox"]')];
    if(menus.length<2)return '(no submenu opened)';
    const sub=menus[menus.length-1];
    const r=sub.getBoundingClientRect();
    const rows=[...sub.querySelectorAll('[role="menuitem"],[role="option"]')].map(i=>i.textContent.replace(/\\s+/g,' ').slice(0,50));
    return JSON.stringify({rect:{x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)},rows});
  })()`);
  // move back to a neutral parent item to close submenu cleanly? next hover replaces it anyway
}
console.log('SUBMENUS:', JSON.stringify(out, null, 1));
// close: click far away instead of Escape (Escape may walk breadcrumb after menu closes)
await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
await sleep(300);
console.log('final path:', await evalJs('location.pathname'));
ws.close();
