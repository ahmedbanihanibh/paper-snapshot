import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
const key=async(k,code,kc)=>{await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc});await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc});};
const palette=async()=>await evalJs(`(()=>{
  const inp=document.activeElement;
  if(!inp||!inp.getAttribute)return 'no input';
  let p=inp; for(let i=0;i<12&&p;i++){const r=p.getBoundingClientRect();if(r.width>300&&r.width<900&&r.height>100){break}p=p.parentElement}
  if(!p)return 'no panel';
  const b=p.getBoundingClientRect();
  const rows=[...p.querySelectorAll('div,button,[role]')].filter(x=>{const r=x.getBoundingClientRect();return r.height>20&&r.height<44&&r.width>60&&r.width>b.width*0.5}).map(x=>x.textContent.replace(/\\s+/g,' ').slice(0,55));
  const seen=new Set(); const uniq=[]; for(const t of rows){if(!seen.has(t)){uniq.push(t);seen.add(t);}}
  return JSON.stringify({rect:{x:b.x|0,y:b.y|0,w:b.width|0,h:b.height|0},placeholder:inp.getAttribute('placeholder'),rows:uniq.slice(0,20)});
})()`);

await key('f','KeyF',70); await sleep(800);
await send('Input.insertText',{text:'created'}); await sleep(700);
console.log('step1:', await palette());
await key('Enter','Enter',13); await sleep(900);
console.log('step2:', await palette());
ws.close();
