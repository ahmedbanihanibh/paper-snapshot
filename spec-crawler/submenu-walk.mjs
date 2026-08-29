import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});return r.result?.result?.value};

await key('Escape','Escape',27); await sleep(400);
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'}); await sleep(6500);
const pt=JSON.parse(await evalJs(`(()=>{const r=[...document.querySelectorAll('a[href*="/issue/"]')][1];const b=r.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22})})()`));
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:pt.x,y:pt.y,button:'right',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:pt.x,y:pt.y,button:'right',clickCount:1});
await sleep(800);
const out={};
const LABELS=['Mark as','Remove','Copy','Convert to','Move','Open in','Create related','More properties','Remind me'];
for (const label of LABELS) {
  const p = await evalJs(`(()=>{
    const items=[...document.querySelectorAll('[role="menuitem"],[role="option"]')].filter(x=>x.textContent.startsWith(${JSON.stringify(label)}));
    if(!items.length)return null; const r=items[0].getBoundingClientRect(); return JSON.stringify({x:r.x+60,y:r.y+r.height/2});
  })()`);
  if(!p){out[label]='(row not found)';continue}
  const pp=JSON.parse(p);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pp.x,y:pp.y}); await sleep(750);
  out[label] = await evalJs(`(()=>{
    const menus=[...document.querySelectorAll('[role="menu"],[role="listbox"]')];
    if(menus.length<2)return '(no submenu)';
    const sub=menus[menus.length-1];
    return [...sub.querySelectorAll('[role="menuitem"],[role="option"]')].map(i=>i.textContent.replace(/\s+/g,' ').slice(0,44)).join(' | ');
  })()`);
}
console.log(JSON.stringify(out,null,1));
await key('Escape','Escape',27); await sleep(200); await key('Escape','Escape',27);
ws.close();
