import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
for (const url of ['https://linear.app/test-workspace-bb/team/TES/cycle/3','https://linear.app/test-workspace-bb/team/TES/backlog']) {
  await send('Page.navigate',{url}); await sleep(5500);
  console.log(url.split('/').slice(-2).join('/'), '=>', await evalJs(`(()=>{
    const main=document.querySelector('main')||document.body;
    const rows=document.querySelectorAll('a[href*="/issue/"]').length;
    // find centered empty-state block: an element ~centered with an svg + text
    const cands=[...main.querySelectorAll('div')].filter(d=>{
      const r=d.getBoundingClientRect();
      return r.width>200&&r.width<700&&r.height>80&&r.height<500&&Math.abs((r.x+r.width/2)-((245+1432)/2))<200&&d.querySelector('svg')&&d.textContent.trim().length>10&&d.textContent.length<400;
    });
    const c=cands[cands.length-1];
    if(!c)return JSON.stringify({rows,empty:false});
    const b=c.getBoundingClientRect(); const svg=c.querySelector('svg'); const sb=svg?.getBoundingClientRect();
    return JSON.stringify({rows,empty:true,rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},svg:sb?{w:sb.width|0,h:sb.height|0}:null,txt:c.textContent.replace(/\\s+/g,' ').slice(0,220),buttons:[...c.querySelectorAll('button')].map(x=>x.textContent.trim()).slice(0,5)});
  })()`));
}
ws.close();
