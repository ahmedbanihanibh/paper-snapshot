import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(200);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6000);
const row = JSON.parse(await evalJs(`(()=>{
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<500});
  const r=rows[0];
  const svgs=[...r.querySelectorAll('svg')].map(x=>{const b=x.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}});
  return JSON.stringify(svgs);
})()`));
const s = row.find(s=>s.x>1300);
if (s) {
  await click(s.x+s.w/2, s.y+s.h/2); await sleep(900);
  console.log('avatar click:', await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>150&&r.width<900&&r.height>60&&r.height<600});
    const m=cand[cand.length-1]; if(!m)return 'no overlay, path='+location.pathname;
    const b=m.getBoundingClientRect();
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},txt:m.textContent.replace(/\\s+/g,' ').slice(0,140)});
  })()`));
  await key('Escape','Escape',27); await sleep(300);
}
console.log('path:', await evalJs('location.pathname'));
ws.close();
