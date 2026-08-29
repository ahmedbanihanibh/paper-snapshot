import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
console.log(await evalJs(`(()=>{
  const out={};
  const btn=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Submit comment');
  let p=btn;
  const chain=[];
  for(let i=0;i<12&&p;i++){
    const r=p.getBoundingClientRect(); const cs=getComputedStyle(p);
    chain.push({tag:p.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,bg:cs.backgroundColor,radius:cs.borderRadius,shadow:cs.boxShadow==='none'?'':cs.boxShadow.slice(0,80)});
    p=p.parentElement;
  }
  out.chain=chain;
  // placeholder text inside composer area
  const near=[...document.querySelectorAll('*')].filter(e=>{const r=e.getBoundingClientRect();return r.y>560&&r.y<620&&r.x>300&&r.x<800&&e.children.length===0&&e.textContent.trim()});
  out.placeholder=near.slice(0,4).map(e=>{const cs=getComputedStyle(e);return {t:e.textContent.slice(0,40),size:cs.fontSize,color:cs.color}});
  // timeline body text (non-link)
  const body=[...document.querySelectorAll('*')].filter(e=>e.children.length===0&&/created the issue on behalf|delegated to/.test(e.textContent)).slice(0,2);
  out.body=body.map(e=>{const cs=getComputedStyle(e);return {t:e.textContent.slice(0,40),size:cs.fontSize,weight:cs.fontWeight,color:cs.color}});
  return JSON.stringify(out,null,1);
})()`));
ws.close();
