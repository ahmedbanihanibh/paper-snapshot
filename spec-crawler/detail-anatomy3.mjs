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
  // the comment composer panel: ancestor of the Submit comment button
  const btn=[...document.querySelectorAll('button')].find(b=>b.getAttribute('aria-label')==='Submit comment');
  if(btn){
    let p=btn, panel=null;
    for(let i=0;i<10&&p;i++){const r=p.getBoundingClientRect();if(r.width>500){panel=p;break}p=p.parentElement}
    if(panel){const r=panel.getBoundingClientRect();const cs=getComputedStyle(panel);
      out.panel={x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,bg:cs.backgroundColor,radius:cs.borderRadius,border:cs.border.slice(0,60),shadow:cs.boxShadow.slice(0,100)};
      const ed=panel.querySelector('[contenteditable]');
      if(ed){const er=ed.getBoundingClientRect();const ec=getComputedStyle(ed);out.editable={x:er.x|0,y:er.y|0,w:er.width|0,h:er.height|0,size:ec.fontSize,ph:ed.getAttribute('data-empty-placeholder')||ed.getAttribute('aria-placeholder')||ed.getAttribute('aria-label')};}
      out.panelTxt=panel.textContent.replace(/\\s+/g,' ').slice(0,60);
    }
    const br=btn.getBoundingClientRect(); out.submitBtn={x:br.x|0,y:br.y|0,w:br.width|0,h:br.height|0,bg:getComputedStyle(btn).backgroundColor};
  }
  // timeline row inner text spans
  const a=[...document.querySelectorAll('span')].filter(e=>e.children.length===0&&/created the issue|delegated/.test(e.textContent));
  out.spans=a.slice(0,4).map(e=>{const cs=getComputedStyle(e);return {t:e.textContent.slice(0,30),size:cs.fontSize,weight:cs.fontWeight,color:cs.color}});
  // actor name links
  const links=[...document.querySelectorAll('span,a')].filter(e=>e.children.length===0&&/^(Ahmed Banihani|Linear|Cursor)$/.test(e.textContent.trim())).slice(0,3);
  out.actors=links.map(e=>{const cs=getComputedStyle(e);return {t:e.textContent,size:cs.fontSize,weight:cs.fontWeight,color:cs.color}});
  return JSON.stringify(out,null,1);
})()`));
ws.close();
