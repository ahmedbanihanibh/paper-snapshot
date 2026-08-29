import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/inbox'}); await sleep(6000);
console.log(await evalJs(`(()=>{
  // two panes: list pane + detail pane
  const panes=[...document.querySelectorAll('div')].filter(d=>{const r=d.getBoundingClientRect();return r.y<80&&r.height>600&&r.width>200&&r.width<600});
  const out={panes:panes.slice(0,3).map(p=>{const r=p.getBoundingClientRect();return {x:r.x|0,w:r.width|0}})};
  // notification rows
  const rows=[...document.querySelectorAll('a,[role="listitem"],div')].filter(e=>{
    const r=e.getBoundingClientRect();
    return r.x>240&&r.x<420&&r.width>250&&r.width<420&&r.height>50&&r.height<90&&e.textContent.trim().length>10&&e.children.length>0&&e.children.length<6;
  });
  out.rows=rows.slice(0,8).map(e=>{
    const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    return {tag:e.tagName,x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,bg:cs.backgroundColor,radius:cs.borderRadius,txt:e.textContent.replace(/\\s+/g,' ').slice(0,60)};
  });
  // group headers (Today / Earlier)
  const heads=[...document.querySelectorAll('*')].filter(e=>{const t=e.textContent.trim();return (t==='Today'||t==='Earlier'||t==='Yesterday')&&e.children.length===0});
  out.headers=heads.map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {t:e.textContent,x:r.x|0,y:r.y|0,h:r.height|0,size:cs.fontSize,weight:cs.fontWeight,color:cs.color}});
  return JSON.stringify(out,null,1);
})()`));
ws.close();
