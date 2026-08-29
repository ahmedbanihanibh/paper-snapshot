import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};
const wrapText=async()=>await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>200&&r.height>100});
  const m=cand[cand.length-1]; if(!m)return 'none';
  return JSON.stringify({ph:document.activeElement?.getAttribute?.('placeholder'),txt:m.textContent.replace(/\\s+/g,' ').slice(0,300)});
})()`);
await key('k','KeyK',75,4); await sleep(800); // ⌘K (modifiers: 4 = Meta)
await send('Input.insertText',{text:'create team'}); await sleep(800);
console.log('palette:', await wrapText());
await key('Enter','Enter',13); await sleep(1500);
console.log('after enter:', await wrapText(), 'path:', await evalJs('location.pathname'));
ws.close();
