import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/my-issues/created'}); await sleep(6500);
console.log(await evalJs(`(()=>{
  const out={};
  // columns: headers with status names
  const cols=[...document.querySelectorAll('div')].filter(d=>{const r=d.getBoundingClientRect();return r.y>90&&r.y<160&&r.width>250&&r.width<420&&r.height>20&&r.height<60&&/Backlog|Todo|In Progress|Done|Canceled|In Review/.test(d.textContent)&&d.children.length<8});
  out.columnHeaders=cols.slice(0,7).map(c=>{const r=c.getBoundingClientRect();return {t:c.textContent.replace(/\\s+/g,' ').slice(0,30),x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0}});
  // cards: links
  const cards=[...document.querySelectorAll('a[href*="/issue/"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>250&&r.width<400&&r.height>60});
  const c0=cards[0];
  if(c0){
    const r=c0.getBoundingClientRect(); const cs=getComputedStyle(c0);
    out.card={x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,bg:cs.backgroundColor,radius:cs.borderRadius,border:cs.border,shadow:cs.boxShadow.slice(0,90)};
    out.cardParts=[...c0.querySelectorAll('*')].filter(e=>e.children.length===0).slice(0,10).map(e=>{
      const b=e.getBoundingClientRect(); const s=getComputedStyle(e);
      return {tag:e.tagName,x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0,size:s.fontSize,weight:s.fontWeight,txt:e.textContent.slice(0,26)};
    });
    // gap between two cards in same column
    const same=cards.filter(c=>Math.abs(c.getBoundingClientRect().x-r.x)<4).slice(0,2);
    if(same.length===2){const a=same[0].getBoundingClientRect(),b=same[1].getBoundingClientRect();out.cardGap=Math.round(b.y-(a.y+a.height));}
  }
  out.cardCount=cards.length;
  // column gap
  if(out.columnHeaders.length>=2){out.colGap=out.columnHeaders[1].x-(out.columnHeaders[0].x+out.columnHeaders[0].w);}
  return JSON.stringify(out,null,1);
})()`));
ws.close();
