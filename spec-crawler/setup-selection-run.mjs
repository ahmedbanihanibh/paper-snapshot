import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
// re-expand collapsed group: hover its header then click Expand group
const h = await evalJs(`(()=>{
  const d=[...document.querySelectorAll('div')].find(x=>{const r=x.getBoundingClientRect();return r.x>240&&r.x<340&&r.y>55&&r.y<80&&/Backlog/.test(x.textContent)&&x.textContent.length<20});
  if(!d)return null; const r=d.getBoundingClientRect(); return JSON.stringify({x:r.x+30,y:r.y+r.height/2});
})()`);
if (h) {
  const p=JSON.parse(h);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(700);
  const btn = await evalJs(`(()=>{const b=[...document.querySelectorAll('[aria-label]')].find(x=>/expand group/i.test(x.getAttribute('aria-label')||''));if(!b)return null;const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
  if (btn) { const q=JSON.parse(btn);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:q.x,y:q.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:q.x,y:q.y,button:'left',clickCount:1});
    await sleep(800); console.log('expanded'); }
  else console.log('no expand btn');
}
// select 3 adjacent rows: hover row0, x, j, x, j, x
const r0 = JSON.parse(await evalJs(`(()=>{const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<400});const b=rows[0].getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22})})()`));
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:r0.x,y:r0.y}); await sleep(400);
await key('x','KeyX',88); await sleep(300);
await key('j','KeyJ',74); await sleep(200); await key('x','KeyX',88); await sleep(300);
await key('j','KeyJ',74); await sleep(200); await key('x','KeyX',88); await sleep(300);
console.log('selected:', await evalJs(`(()=>{const b=[...document.querySelectorAll('div')].find(d=>/selected/.test(d.textContent)&&d.getBoundingClientRect().width<500&&d.getBoundingClientRect().height>30);return b?b.textContent.replace(/\\s+/g,' ').slice(0,30):'no bar'})()`));
ws.close();
