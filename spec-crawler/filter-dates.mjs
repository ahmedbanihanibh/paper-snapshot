import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(150);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
const overlay=async()=>await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.width<900&&r.height>40&&r.height<700});
  const m=cand[cand.length-1]; if(!m)return 'none';
  const b=m.getBoundingClientRect();
  const rows=[...m.querySelectorAll('div,button,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>20&&r.height<44&&r.width>60}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,50));
  const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){uniq.push(t);seen.add(t);}}
  return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq.slice(0,16)});
})()`);

// clear existing filters
const clr = await evalJs(`(()=>{const b=[...document.querySelectorAll('button')].find(x=>x.textContent.trim()==='Clear');if(!b)return null;const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2})})()`);
if (clr) { const p=JSON.parse(clr); await click(p.x,p.y); await sleep(700); }

// f → "created" — dates submenu
await key('f','KeyF',70); await sleep(700);
await send('Input.insertText',{text:'created'}); await sleep(700);
console.log('created options:', await overlay());
await key('Enter','Enter',13); await sleep(900);
console.log('after enter:', await overlay());
// chip band
const band = await evalJs(`(()=>{
  const out=[]; for(const e of document.querySelectorAll('*')){const r=e.getBoundingClientRect();
    if(r.y>95&&r.y<135&&r.x>240&&r.x<900&&r.height>18&&r.height<28&&e.children.length<=4){const t=e.textContent.replace(/\\s+/g,' ').trim();if(t&&t.length<60)out.push({t,x:Math.round(r.x),w:Math.round(r.width)});}}
  return JSON.stringify(out);
})()`);
console.log('chip band:', band);
ws.close();
