import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/cycle/3'}); await sleep(5500);
console.log(await evalJs(`(()=>{
  // whole content area right of sidebar
  const els=[...document.querySelectorAll('*')].filter(e=>{
    const r=e.getBoundingClientRect();
    return r.x>250&&r.y>120&&r.width>150&&r.height>60&&e.children.length<=8;
  }).slice(0,30).map(e=>{
    const r=e.getBoundingClientRect();
    return {tag:e.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,svg:!!e.querySelector('svg'),txt:e.textContent.replace(/\\s+/g,' ').slice(0,90)};
  });
  return JSON.stringify(els,null,0);
})()`));
ws.close();
