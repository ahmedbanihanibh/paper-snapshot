import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const panelText=async()=>await evalJs(`(()=>{
  const a=document.activeElement; if(!a)return 'none';
  let p=a; for(let i=0;i<15&&p;i++){const r=p.getBoundingClientRect();if(r.width>250&&r.height>120)break;p=p.parentElement}
  if(!p)return 'no panel';
  const b=p.getBoundingClientRect();
  return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},ph:a.getAttribute&&a.getAttribute('placeholder'),txt:p.textContent.replace(/\\s+/g,' ').slice(0,600)});
})()`);
// currently in step2 from last run? state unknown — reset via Escape then redo
await key('Escape','Escape',27); await sleep(300);
await key('Escape','Escape',27); await sleep(500);
await key('f','KeyF',70); await sleep(800);
await send('Input.insertText',{text:'created'}); await sleep(700);
console.log('STEP1:', await panelText());
await key('Enter','Enter',13); await sleep(900);
console.log('STEP2:', await panelText());
await key('Enter','Enter',13); await sleep(1000);
console.log('STEP3 (applied?):', await panelText());
console.log('chip band:', await evalJs(`(()=>{
  const out=[]; for(const e of document.querySelectorAll('*')){const r=e.getBoundingClientRect();
    if(r.y>95&&r.y<135&&r.x>240&&r.x<1000&&r.height>18&&r.height<28&&e.children.length<=4){const t=e.textContent.replace(/\\s+/g,' ').trim();if(t&&t.length<70)out.push({t,x:Math.round(r.x),w:Math.round(r.width)});}}
  return JSON.stringify(out);
})()`));
console.log('path:', await evalJs('location.pathname'));
ws.close();
