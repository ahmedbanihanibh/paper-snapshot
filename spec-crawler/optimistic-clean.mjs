import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(r.result?.exceptionDetails)console.error('EVAL ERR:',(r.result.exceptionDetails.exception?.description||'').slice(0,300));return r.result?.result?.value};

await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});
await sleep(6000);
// scroll to very top: In Progress / Todo groups both near top
await evalJs(`(()=>{const sc=[...document.querySelectorAll('div')].find(d=>{const cs=getComputedStyle(d);return (cs.overflowY==='auto'||cs.overflowY==='scroll')&&d.scrollHeight>d.clientHeight+50&&d.querySelector('a[href*="/issue/"]')});if(sc)sc.scrollTop=0;return 'top'})()`);
await sleep(600);
// find the 'Write onboarding doc' row (Todo). If not in first window, it's fine — Todo is near top.
const state = await evalJs(`(()=>{
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')];
  return JSON.stringify(rows.map(r=>({id:(r.getAttribute('href')||'').split('/')[3], t:r.textContent.slice(0,30), y:Math.round(r.getBoundingClientRect().y)})),null,0)
})()`);
console.log('rows in window:', state.slice(0,800));
const target='Investigate flaky trap';
const pos = await evalJs(`(()=>{const el=[...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes(${JSON.stringify(target)}));if(!el)return null;const b=el.getBoundingClientRect();return JSON.stringify({x:b.x+400,y:b.y+22})})()`);
if(!pos){console.log('target not in window — abort');process.exit(1)}
const pt=JSON.parse(pos);
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pt.x,y:pt.y});
await sleep(400);
// arm: record y of target + group counts, mutation timestamps relative to t0
await evalJs(`(()=>{
  window.__m={moved:null,counts:null,firstNet:null,muts:[],t0:null};
  const find=()=> [...document.querySelectorAll('a[href*="/issue/"]')].find(a=>a.textContent.includes(${JSON.stringify(target)}));
  window.__m.y0=find().getBoundingClientRect().y;
  const countEl=()=>[...document.querySelectorAll('button')].filter(b=>/^\\d+$/.test(b.textContent)).map(b=>b.textContent).join(',');
  window.__m.counts0=countEl();
  const mo=new MutationObserver(()=>{
    if(window.__m.t0===null)return;
    const t=performance.now()-window.__m.t0;
    window.__m.muts.push(Math.round(t));
    const r=find();
    if(window.__m.moved===null){
      if(!r) window.__m.moved={t:Math.round(t),how:'left-dom'};
      else if(Math.abs(r.getBoundingClientRect().y-window.__m.y0)>20) window.__m.moved={t:Math.round(t),how:'moved',newY:Math.round(r.getBoundingClientRect().y)};
    }
    if(window.__m.countsChanged===undefined&&countEl()!==window.__m.counts0)window.__m.countsChanged={t:Math.round(t),now:countEl()};
  });
  mo.observe(document.body,{childList:true,subtree:true,characterData:true});
  const po=new PerformanceObserver(l=>{for(const e of l.getEntries()){if(window.__m.t0!==null&&/graphql/i.test(e.name)&&window.__m.firstNet===null&&e.startTime>window.__m.t0Abs)window.__m.firstNet=Math.round(e.responseEnd-window.__m.t0Abs)}});
  po.observe({entryTypes:['resource']});
  return 'armed, y0='+window.__m.y0+' counts0='+window.__m.counts0;
})()`).then(v=>console.log(v));
await key('s','KeyS',83); await sleep(700);
await send('Input.insertText',{text:'in prog'}); await sleep(400);
await evalJs(`(()=>{window.__m.t0Abs=performance.now();window.__m.t0=window.__m.t0Abs;return 0})()`);
await key('Enter','Enter',13);
await sleep(3000);
console.log('RESULT:', await evalJs(`JSON.stringify({moved:window.__m.moved,countsChanged:window.__m.countsChanged,firstNet:window.__m.firstNet,mutsFirst10:window.__m.muts.slice(0,10)})`));
ws.close();
