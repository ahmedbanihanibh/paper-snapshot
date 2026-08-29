import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('ERR:',(r.result.exceptionDetails.exception?.description||'').slice(0,150));return r.result?.result?.value};
const click=async(x,y)=>{await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y});await sleep(150);await send('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});};

// find the applied chip anywhere: an element whose text is exactly 'Todo' near a 'Status' icon in the sub-toolbar
const bar = await evalJs(`(()=>{
  const els=[...document.querySelectorAll('main *, [class*="sx-"] *')].filter(e=>{
    const r=e.getBoundingClientRect();
    return r.y>80&&r.y<170&&r.height>16&&r.height<36&&r.width>20&&r.width<200&&e.children.length<6;
  });
  const out=[];
  for(const e of els){
    const t=e.textContent.replace(/\\s+/g,' ').trim();
    if(/^(Status|is|is not|Todo|1|Clear)/.test(t)&&t.length<20){
      const r=e.getBoundingClientRect();
      out.push({tag:e.tagName,t,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height)});
    }
  }
  return JSON.stringify(out.slice(0,20));
})()`);
console.log('chip parts:', bar);
const parts = JSON.parse(bar);
const isSeg = parts.find(p=>p.t==='is');
if (isSeg) {
  await click(isSeg.x+isSeg.w/2, isSeg.y+isSeg.h/2); await sleep(900);
  console.log('operator menu:', await evalJs(`(()=>{
    const fixed=[...document.querySelectorAll('*')].filter(e=>getComputedStyle(e).position==='fixed');
    const cand=fixed.filter(e=>{const r=e.getBoundingClientRect();return r.width>100&&r.width<400&&r.height>50&&r.height<500});
    const m=cand[cand.length-1]; if(!m)return 'none';
    const b=m.getBoundingClientRect();
    const rows=[...m.querySelectorAll('div,button,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>22&&r.height<40&&r.width>80}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,40));
    const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){seen.add(t);uniq.push(t);}}
    return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},rows:uniq});
  })()`));
}
ws.close();
