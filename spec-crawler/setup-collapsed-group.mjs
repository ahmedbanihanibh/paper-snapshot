import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
await key('Escape','Escape',27); await sleep(300);
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'}); await sleep(6000);
// collapse the first group via its chevron (aria-label Collapse group)
const btn = await evalJs(`(()=>{const b=[...document.querySelectorAll('button,[aria-label]')].find(x=>x.getAttribute('aria-label')==='Collapse group');if(!b)return null;const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
console.log('collapse btn:', btn);
if (btn) {
  const p=JSON.parse(btn);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(200);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
  await sleep(800);
}
console.log('groups now:', await evalJs(`(()=>{
  const heads=[...document.querySelectorAll('button,[aria-label]')].filter(x=>/collapse group|expand group/i.test(x.getAttribute('aria-label')||''));
  return JSON.stringify(heads.map(h=>({aria:h.getAttribute('aria-label'),y:Math.round(h.getBoundingClientRect().y)})));
})()`));
ws.close();
