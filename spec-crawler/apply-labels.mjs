import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'}); await sleep(6500);
const jobs=[[0,'bug'],[1,'feature'],[2,'improvement']];
for (const [idx,label] of jobs) {
  const pt = await evalJs(`(()=>{
    const rows=[...document.querySelectorAll('a[href*="/issue/"]')].filter(r=>{const b=r.getBoundingClientRect();return b.y>150&&b.y<600});
    const r=rows[${idx}]; if(!r)return null; const b=r.getBoundingClientRect();
    return JSON.stringify({x:b.x+400,y:b.y+b.height/2,id:(r.getAttribute('href')||'').split('/')[3]});
  })()`);
  if(!pt){console.log('row',idx,'missing');continue}
  const p=JSON.parse(pt);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(400);
  await key('l','KeyL',76); await sleep(800);
  await send('Input.insertText',{text:label}); await sleep(600);
  await key('Enter','Enter',13); await sleep(500);
  await key('Escape','Escape',27); await sleep(500);
  console.log('labeled', p.id, 'with', label, '— path:', await evalJs('location.pathname'));
  const path = await evalJs('location.pathname');
  if(!/\/all$/.test(path)){await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/team/TES/all'});await sleep(5000);}
}
// verify: rows now show label pills
console.log('label pills on rows:', await evalJs(`(()=>{
  const rows=[...document.querySelectorAll('a[href*="/issue/"]')].slice(0,6);
  return JSON.stringify(rows.map(r=>({id:(r.getAttribute('href')||'').split('/')[3],labels:[...r.querySelectorAll('span')].map(s=>s.textContent.trim()).filter(t=>/^(Bug|Feature|Improvement)$/.test(t))})));
})()`));
ws.close();
