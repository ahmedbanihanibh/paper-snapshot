import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
console.log(await evalJs(`(()=>{
  const seen=new Set(); const out=[];
  for(const e of document.querySelectorAll('*')){
    const r=e.getBoundingClientRect();
    if(r.y>80&&r.y<185&&r.x>240&&r.height>14&&r.height<40&&r.width>15&&r.width<300&&e.children.length<=3){
      const t=e.textContent.replace(/\\s+/g,' ').trim();
      if(t&&t.length<40&&!seen.has(t+'|'+Math.round(r.x))){seen.add(t+'|'+Math.round(r.x));out.push({t,x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),tag:e.tagName});}
    }
  }
  return JSON.stringify(out,null,0);
})()`));
ws.close();
