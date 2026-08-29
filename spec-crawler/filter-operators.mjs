import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('ERR:',(r.result.exceptionDetails.exception?.description||'').slice(0,150));return r.result?.result?.value};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(120);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};

// dismiss any open overlay by clicking page ground (left sidebar dead spot bottom)
await click(150, 700); await sleep(500);
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6000);

// apply Status=Todo via f (filter) → type todo → keyboard select
await key('f','KeyF',70); await sleep(600);
await send('Input.insertText',{text:'todo'}); await sleep(600);
await key('ArrowDown','ArrowDown',40); await sleep(150);
await key('Enter','Enter',13); await sleep(900);
console.log('path:', await evalJs('location.pathname'));

// find the filter chip's operator segment ("is") in the toolbar
const chip = await evalJs(`(()=>{
  const btns=[...document.querySelectorAll('button,[role="button"]')].filter(b=>{const r=b.getBoundingClientRect();return r.y>30&&r.y<110&&r.height>20&&r.height<32});
  return JSON.stringify(btns.map(b=>{const r=b.getBoundingClientRect();return {t:b.textContent.replace(/\\s+/g,' ').slice(0,24),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)}}));
})()`);
console.log('toolbar buttons:', chip);
