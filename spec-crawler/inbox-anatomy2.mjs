import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(150);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};
// select row 1 to measure selected wash
await click(440, 87); await sleep(1200);
console.log(await evalJs(`(()=>{
  const out={};
  // selected row bg
  const rows=[...document.querySelectorAll('a')].filter(e=>{const r=e.getBoundingClientRect();return r.x>240&&r.x<250&&r.width>380&&r.height>50&&r.height<60});
  out.rowCount=rows.length;
  const sel=rows.find(r=>{const inner=r.querySelector('div>div');return inner&&getComputedStyle(inner.querySelector('div')||inner).backgroundColor!=='rgba(0, 0, 0, 0)'});
  const r0=rows[0];
  // walk r0 descendants for bg
  const washes=[...r0.querySelectorAll('*')].map(e=>getComputedStyle(e).backgroundColor).filter(b=>b!=='rgba(0, 0, 0, 0)');
  out.row0washes=[...new Set(washes)].slice(0,4);
  // inner anatomy of row 0
  const parts=[...r0.querySelectorAll('img,svg,span,div')].filter(e=>e.children.length===0).slice(0,14).map(e=>{
    const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    return {tag:e.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,size:cs.fontSize,weight:cs.fontWeight,color:cs.color.replace(/rgba?\\(|\\)/g,''),txt:e.textContent.slice(0,26),radius:cs.borderRadius};
  });
  out.parts=parts;
  // detail pane
  const dp=[...document.querySelectorAll('div')].filter(d=>{const r=d.getBoundingClientRect();return r.x>630&&r.x<680&&r.height>500&&r.width>500});
  out.detailPane=dp.slice(0,2).map(p=>{const r=p.getBoundingClientRect();return {x:r.x|0,w:r.width|0}});
  return JSON.stringify(out,null,1);
})()`));
ws.close();
