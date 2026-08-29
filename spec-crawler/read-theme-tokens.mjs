import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
if(!tab){console.log('NO LINEAR TAB');process.exit(1)}
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(method,params)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method,params}));const h=m=>{const d=JSON.parse(m);if(d.id===mid){ws.off('message',h);res(d.result)}};ws.on('message',h)});
const expr = `(()=>{
  const out={};
  const read=(el,tag)=>{const cs=getComputedStyle(el);const o={};for(let i=0;i<cs.length;i++){const p=cs[i];if(p.startsWith('--')&&!p.startsWith('--sx-')){o[p]=cs.getPropertyValue(p).trim()}}out[tag]=o;};
  read(document.documentElement,'root');
  const tp=document.querySelector('[class*="theme-provider"]');
  if(tp)read(tp,'themeProvider');
  out.meta={theme:document.documentElement.getAttribute('data-theme')||'(none)',cls:document.documentElement.className};
  return JSON.stringify(out);
})()`;
const r = await send('Runtime.evaluate',{expression:expr,returnByValue:true});
console.log(r.result.value);
ws.close();
