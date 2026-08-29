import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
// type team name into the focused input
await send('Input.insertText',{text:'Empty Fixture'}); await sleep(600);
// find and click the Create team submit button
const btn = await evalJs(`(()=>{
  const b=[...document.querySelectorAll('button')].find(x=>/Create team/i.test(x.textContent));
  if(!b)return null; const r=b.getBoundingClientRect();
  return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,t:b.textContent.trim()});
})()`);
console.log('submit btn:', btn);
if (btn) {
  const p=JSON.parse(btn);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(150);
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:p.x,y:p.y,button:'left',clickCount:1});
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:p.x,y:p.y,button:'left',clickCount:1});
  await sleep(2500);
}
console.log('path:', await evalJs('location.pathname'));
ws.close();
