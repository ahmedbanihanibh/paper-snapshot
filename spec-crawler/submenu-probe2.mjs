import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)return 'EX: '+(r.result.exceptionDetails.exception?.description??r.result.exceptionDetails.text);return r.result?.result?.value};

// instrument: watch contextmenu events + DOM mutations
await evalJs(`(()=>{
  window.__cmLog=[];
  document.addEventListener('contextmenu',e=>{window.__cmLog.push({trusted:e.isTrusted,prevented:e.defaultPrevented,target:e.target.tagName+'.'+(e.target.className||'').toString().slice(0,20)})},true);
  window.__added=[];
  window.__mo=new MutationObserver(ms=>{for(const m of ms)for(const n of m.addedNodes)if(n.nodeType===1)window.__added.push(n.tagName+' '+(n.getAttribute&&(n.getAttribute('role')||''))+' '+(n.className||'').toString().slice(0,30));});
  window.__mo.observe(document.body,{childList:true,subtree:true});
  return 'armed';
})()`);
const info = JSON.parse(await evalJs(`(()=>{const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<500});const b=rows[1].getBoundingClientRect();return JSON.stringify({x:b.x,y:b.y,h:b.height})})()`));
const cx=info.x+300, cy=info.y+info.h/2;
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:cx,y:cy}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:cx,y:cy,button:'right',clickCount:1,buttons:2});
await sleep(60);
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:cx,y:cy,button:'right',clickCount:1,buttons:0});
await sleep(1500);
console.log('contextmenu events:', await evalJs('JSON.stringify(window.__cmLog)'));
console.log('added nodes:', await evalJs('JSON.stringify(window.__added.slice(0,40))'));
await evalJs('window.__mo.disconnect();"ok"');
ws.close();
