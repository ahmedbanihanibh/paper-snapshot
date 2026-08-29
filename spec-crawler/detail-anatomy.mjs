import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/issue/TES-52'}); await sleep(6000);
// scroll main column to bottom to reveal timeline + composer
await evalJs(`(()=>{const s=[...document.querySelectorAll('*')].find(e=>e.scrollHeight>e.clientHeight+200&&e.clientHeight>400);if(s)s.scrollTop=s.scrollHeight;return 'ok'})()`);
await sleep(800);
console.log(await evalJs(`(()=>{
  const out={};
  // Activity header
  const ah=[...document.querySelectorAll('*')].find(e=>e.textContent.trim()==='Activity'&&e.children.length===0);
  if(ah){const r=ah.getBoundingClientRect();const cs=getComputedStyle(ah);out.activityHeader={x:r.x|0,y:r.y|0,size:cs.fontSize,weight:cs.fontWeight,color:cs.color};}
  // timeline rows: small text rows under activity
  const rows=[...document.querySelectorAll('div')].filter(e=>{
    const r=e.getBoundingClientRect();
    return r.x>250&&r.x<400&&r.width>300&&r.height>14&&r.height<40&&/created|changed|added|moved|set|updated|ago/.test(e.textContent)&&e.children.length>0&&e.children.length<8&&e.textContent.length<160;
  });
  out.timelineRows=rows.slice(0,6).map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,size:cs.fontSize,txt:e.textContent.replace(/\\s+/g,' ').slice(0,80)}});
  // comment composer: textarea/contenteditable placeholder
  const comp=[...document.querySelectorAll('[contenteditable],[placeholder],textarea')].filter(e=>{const r=e.getBoundingClientRect();return r.y>400&&r.width>300});
  out.composer=comp.slice(0,3).map(e=>{
    const r=e.getBoundingClientRect(); const cs=getComputedStyle(e);
    let p=e; for(let i=0;i<6&&p;i++){const c=getComputedStyle(p);if(c.backgroundColor!=='rgba(0, 0, 0, 0)'){break}p=p.parentElement}
    const pc=p?getComputedStyle(p):null; const pr=p?p.getBoundingClientRect():null;
    return {tag:e.tagName,ph:e.getAttribute('placeholder')||e.getAttribute('data-placeholder')||e.getAttribute('aria-label'),x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,
      panel:pr?{x:pr.x|0,y:pr.y|0,w:pr.width|0,h:pr.height|0,bg:pc.backgroundColor,radius:pc.borderRadius,shadow:pc.boxShadow.slice(0,80)}:null};
  });
  return JSON.stringify(out,null,1);
})()`));
ws.close();
