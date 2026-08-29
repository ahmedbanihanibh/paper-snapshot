import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
// find first group header (e.g. "In Progress 4") and hover it
const head = await evalJs(`(()=>{
  const h=[...document.querySelectorAll('div')].find(d=>{const r=d.getBoundingClientRect();return r.x>240&&r.x<330&&r.y>55&&r.y<140&&r.height>20&&r.height<40&&/In Progress|Todo|Backlog/.test(d.textContent)&&d.textContent.length<30});
  if(!h)return null; const r=h.getBoundingClientRect();
  return JSON.stringify({x:r.x+30,y:r.y+r.height/2,t:d=>0,txt:h.textContent.slice(0,20)});
})()`);
console.log('header:', head);
if (head) {
  const p=JSON.parse(head);
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:p.x,y:p.y}); await sleep(700);
  const btn = await evalJs(`(()=>{const b=[...document.querySelectorAll('button,[aria-label]')].find(x=>/collapse/i.test(x.getAttribute('aria-label')||''));if(!b)return null;const r=b.getBoundingClientRect();return JSON.stringify({x:r.x+r.width/2,y:r.y+r.height/2,aria:b.getAttribute('aria-label')})})()`);
  console.log('after hover:', btn);
  if (btn) {
    const q=JSON.parse(btn);
    await send('Input.dispatchMouseEvent',{type:'mousePressed',x:q.x,y:q.y,button:'left',clickCount:1});
    await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:q.x,y:q.y,button:'left',clickCount:1});
    await sleep(800);
    console.log('rows visible now:', await evalJs(`document.querySelectorAll('a[href*="/issue/"]').length`));
  }
}
ws.close();
