import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
console.log(await evalJs(`(()=>{
  const out={};
  // inner spans of first timeline row
  const row=[...document.querySelectorAll('div')].find(e=>{const r=e.getBoundingClientRect();return r.x>300&&r.x<310&&r.width>600&&r.height===28&&/created the issue/.test(e.textContent)});
  if(row){
    out.rowSpans=[...row.querySelectorAll('span,a')].filter(e=>e.children.length===0&&e.textContent.trim()).slice(0,8).map(e=>{
      const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
      return {t:e.textContent.slice(0,24),size:cs.fontSize,weight:cs.fontWeight,color:cs.color,x:r.x|0,h:r.height|0};
    });
    const av=row.querySelector('img,[class*="avatar"],span');
    if(av){const r=av.getBoundingClientRect();out.avatar={w:r.width|0,h:r.height|0};}
  }
  // comment affordance anywhere with 'comment' text
  const c=[...document.querySelectorAll('*')].filter(e=>/comment/i.test(e.getAttribute&&(e.getAttribute('placeholder')||e.getAttribute('aria-label')||e.getAttribute('data-placeholder')||'')||'')||[...(e.childNodes||[])].some(n=>n.nodeType===3&&/Leave a comment/i.test(n.textContent)));
  out.commentEls=c.slice(0,5).map(e=>{
    const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    return {tag:e.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,bg:cs.backgroundColor,radius:cs.borderRadius,txt:(e.textContent||'').replace(/\\s+/g,' ').slice(0,40),ph:e.getAttribute&&(e.getAttribute('placeholder')||e.getAttribute('aria-label'))};
  });
  return JSON.stringify(out,null,1);
})()`));
ws.close();
