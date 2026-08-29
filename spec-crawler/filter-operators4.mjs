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

await key('f','KeyF',70); await sleep(700);
await send('Input.insertText',{text:'todo'}); await sleep(700);
await key('Enter','Enter',13); await sleep(1400);
// dump filter bar band
const band = await evalJs(`(()=>{
  const seen=new Set(); const out=[];
  for(const e of document.querySelectorAll('*')){
    const r=e.getBoundingClientRect();
    if(r.y>80&&r.y<190&&r.x>240&&r.height>14&&r.height<40&&r.width>10&&r.width<300&&e.children.length<=3){
      const t=e.textContent.replace(/\\s+/g,' ').trim();
      const k=t+'|'+Math.round(r.x);
      if(t&&t.length<40&&!seen.has(k)){seen.add(k);out.push({t,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});}
    }
  }
  return JSON.stringify(out);
})()`);
console.log('band:', band);
const parts = JSON.parse(band);
const isSeg = parts.find(p=>p.t==='is');
if (!isSeg) { console.log('no operator segment found'); ws.close(); process.exit(0); }
await click(isSeg.x+isSeg.w/2, isSeg.y+isSeg.h/2); await sleep(1000);
console.log('operator menu:', await evalJs(`(()=>{
  const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
  const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.width<400&&r.height>40&&r.height<500});
  const m=cand[cand.length-1]; if(!m)return 'none';
  const b=m.getBoundingClientRect();
  const rows=[...m.querySelectorAll('div,button,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>22&&r.height<40&&r.width>80}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,40));
  const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){seen.add(t);uniq.push(t);}}
  return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq});
})()`));
ws.close();
