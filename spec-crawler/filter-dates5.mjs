import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const wrapText=async()=>await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>200&&r.height>100});
  const m=cand[cand.length-1]; if(!m)return 'none';
  return JSON.stringify({ph:document.activeElement?.getAttribute?.('placeholder'),txt:m.textContent.replace(/\\s+/g,' ').slice(0,500)});
})()`);
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6000);
await key('f','KeyF',70); await sleep(800);
await send('Input.insertText',{text:'created'}); await sleep(800);
console.log('STEP1:', await wrapText());
await key('Enter','Enter',13); await sleep(900);
console.log('STEP2:', await wrapText());
await key('Enter','Enter',13); await sleep(1100);
console.log('STEP3:', await wrapText());
console.log('chip band:', await evalJs(`(()=>{
  const out=[]; for(const e of document.querySelectorAll('*')){const r=e.getBoundingClientRect();
    if(r.y>95&&r.y<135&&r.x>240&&r.x<1000&&r.height>18&&r.height<28&&e.children.length<=4){const t=e.textContent.replace(/\\s+/g,' ').trim();if(t&&t.length<70)out.push({t,x:Math.round(r.x),w:Math.round(r.width)});}}
  return JSON.stringify(out);
})()`));
console.log('path:', await evalJs('location.pathname'));
ws.close();
