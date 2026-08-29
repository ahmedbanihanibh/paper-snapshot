import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
// 1) hover first inbox row — what actions appear?
const row = JSON.parse(await evalJs(`(()=>{const r=[...document.querySelectorAll('a')].find(e=>{const b=e.getBoundingClientRect();return b.x>240&&b.x<250&&b.width>380&&b.height>50&&b.height<60});const b=r.getBoundingClientRect();return JSON.stringify({x:b.x+200,y:b.y+b.height/2})})()`));
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:row.x,y:row.y}); await sleep(700);
console.log('hover reveals:', await evalJs(`(()=>{
  const btns=[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.x>240&&r.x<650&&r.y>55&&r.y<120&&r.width>10&&r.width<40});
  return JSON.stringify(btns.map(b=>({aria:b.getAttribute('aria-label'),x:Math.round(b.getBoundingClientRect().x),w:Math.round(b.getBoundingClientRect().width)})));
})()`));
// 2) right-click the row — notification context menu
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:row.x,y:row.y,button:'right',clickCount:1});
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:row.x,y:row.y,button:'right',clickCount:1});
await sleep(900);
console.log('inbox row context menu:', await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<400&&r.height>100});
  const m=cand[cand.length-1]; if(!m)return 'none';
  const b=m.getBoundingClientRect();
  const rows=[...m.querySelectorAll('div,button,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>22&&r.height<40&&r.width>140}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,44));
  const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){uniq.push(t);seen.add(t);}}
  return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq});
})()`));
await key('Escape','Escape',27); await sleep(400);
// 3) inbox top toolbar buttons (filter icon, display icon)
console.log('toolbar:', await evalJs(`(()=>{
  const btns=[...document.querySelectorAll('button')].filter(b=>{const r=b.getBoundingClientRect();return r.x>240&&r.x<650&&r.y>0&&r.y<56&&r.width>10});
  return JSON.stringify(btns.map(b=>({aria:b.getAttribute('aria-label')||b.textContent.trim().slice(0,16),x:Math.round(b.getBoundingClientRect().x),y:Math.round(b.getBoundingClientRect().y)})));
})()`));
ws.close();
