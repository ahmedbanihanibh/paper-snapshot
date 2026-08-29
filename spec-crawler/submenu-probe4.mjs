import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)return 'EX: '+(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value};

const info = JSON.parse(await evalJs(`(()=>{const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<500});const b=rows[1].getBoundingClientRect();return JSON.stringify({x:b.x,y:b.y,h:b.height})})()`));
const cx=info.x+300, cy=info.y+info.h/2;
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'right',clickCount:1,buttons:2});
await sleep(900);
const dump = await evalJs(`(()=>{
  const providers=[...document.querySelectorAll('div[class*="theme-provider"]')].filter(p=>p.getBoundingClientRect().width>0);
  const menus=[...document.querySelectorAll('[role="menu"]')];
  return JSON.stringify({providers:providers.length, menus:menus.length,
    first: providers[0] ? (()=>{const r=providers[0].getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}})() : null,
    txt: providers[0]?.textContent.replace(/\\s+/g,' ').slice(0,200)});
})()`);
console.log('while held:', dump);
// release ON the row (same spot) — does menu survive?
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'right',clickCount:1,buttons:0});
await sleep(600);
console.log('after release:', await evalJs(`(()=>{const p=[...document.querySelectorAll('div[class*="theme-provider"]')].filter(x=>x.getBoundingClientRect().width>0);return JSON.stringify({providers:p.length,menus:document.querySelectorAll('[role="menu"]').length})})()`));
ws.close();
