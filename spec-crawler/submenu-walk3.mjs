import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)return 'EX: '+(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value};

// scroll list to top first, then pick a mid-viewport row
await evalJs(`(()=>{const s=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+100&&e.clientHeight>400);if(s)s.scrollTop=0;return 'ok'})()`);
await sleep(500);
const opened = await evalJs(`(()=>{
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>120&&b.y<500});
  const r=rows[2]||rows[0]; if(!r)return 'no row';
  const b=r.getBoundingClientRect();
  const ev=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:b.x+300,clientY:b.y+b.height/2,button:2});
  r.dispatchEvent(ev);
  return JSON.stringify({row:r.textContent.slice(0,40)});
})()`);
console.log('dispatched on:', opened);
await sleep(1000);
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
ws.close();
