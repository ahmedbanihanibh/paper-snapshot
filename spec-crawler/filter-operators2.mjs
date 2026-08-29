import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('ERR:',(r.result.exceptionDetails.exception?.description||'').slice(0,150));return r.result?.result?.value};
const key=async(k,code,kc,mods=0)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});};

await key('f','KeyF',70); await sleep(700);
console.log('after f — overlays:', await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>200&&r.height>100});
  const m=cand[cand.length-1]; if(!m)return 'none';
  const b=m.getBoundingClientRect();
  return JSON.stringify({w:b.width|0,h:b.height|0,txt:m.textContent.replace(/\\s+/g,' ').slice(0,150),placeholder:document.activeElement?.getAttribute('placeholder')});
})()`));
await send('Input.insertText',{text:'todo'}); await sleep(700);
console.log('rows:', await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>200&&r.height>80});
  const m=cand[cand.length-1]; if(!m)return 'none';
  return m.textContent.replace(/\\s+/g,' ').slice(0,250);
})()`));
await key('ArrowDown','ArrowDown',40); await sleep(150);
await key('Enter','Enter',13); await sleep(1200);
console.log('toolbar after apply:', await evalJs(`(()=>{
  const btns=[...document.querySelectorAll('button,[role="button"]')].filter(b=>{const r=b.getBoundingClientRect();return r.y>85&&r.y<150&&r.height>18&&r.height<34&&r.width>10});
  return JSON.stringify(btns.map(b=>{const r=b.getBoundingClientRect();return {t:b.textContent.replace(/\\s+/g,' ').slice(0,26),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),aria:b.getAttribute('aria-label')}}));
})()`));
ws.close();
