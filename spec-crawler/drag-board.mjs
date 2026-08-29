import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const evalJs=async(e)=>{const r=await send('Runtime.evaluate',{expression:e,returnByValue:true,awaitPromise:true});return r.result?.result?.value};
await send('Page.navigate',{url:'https://linear.app/test-workspace-bb/my-issues/created'}); await sleep(6500);
// find a card in Backlog column
const card = JSON.parse(await evalJs(`(()=>{
  const cards=[...document.querySelectorAll('a[href*="/issue/"]')].filter(e=>{const r=e.getBoundingClientRect();return r.width>250&&r.width<400&&r.height>60&&r.x<500&&r.y>150&&r.y<400});
  const c=cards[0]; const r=c.getBoundingClientRect();
  return JSON.stringify({x:r.x+r.width/2,y:r.y+30,id:c.getAttribute('href').split('/')[3]});
})()`));
console.log('dragging', card.id);
const tx=770, ty=card.y; // into Todo column
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:card.x,y:card.y}); await sleep(300);
await send('Input.dispatchMouseEvent',{type:'mousePressed',x:card.x,y:card.y,button:'left',clickCount:1,buttons:1});
await sleep(200);
// move in steps
for (let i=1;i<=8;i++){
  const x=card.x+(tx-card.x)*i/8, y=card.y+(ty-card.y)*i/8;
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x,y,buttons:1}); await sleep(60);
}
await sleep(400);
// mid-drag: inspect ghost/indicator
console.log('mid-drag:', await evalJs(`(()=>{
  const out={};
  // dragged clone: element following cursor (fixed/absolute, high z)
  const ghosts=[...document.querySelectorAll('*')].filter(e=>{const cs=getComputedStyle(e);const r=e.getBoundingClientRect();return (cs.position==='fixed')&&r.width>250&&r.width<400&&r.height>60&&r.height<200&&r.x>500});
  out.ghost=ghosts.slice(0,2).map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,opacity:cs.opacity,transform:cs.transform.slice(0,40),shadow:cs.boxShadow.slice(0,80)}});
  // drop indicator/placeholder in target column
  const ph=[...document.querySelectorAll('div')].filter(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return r.x>590&&r.x<950&&r.width>250&&r.height>2&&r.height<140&&(cs.borderStyle==='dashed'||parseFloat(cs.opacity)<1&&parseFloat(cs.opacity)>0||cs.backgroundColor.includes('lch')&&e.children.length===0)});
  out.placeholder=ph.slice(0,3).map(e=>{const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return {x:r.x|0,y:r.y|0,w:r.width|0,h:r.height|0,bg:cs.backgroundColor,border:cs.border.slice(0,50),opacity:cs.opacity}});
  return JSON.stringify(out,null,1);
})()`));
// drop
await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:tx,y:ty,buttons:1}); await sleep(200);
await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:tx,y:ty,button:'left',clickCount:1,buttons:0});
await sleep(1200);
// verify the card moved columns
console.log('after drop:', await evalJs(`(()=>{
  const c=[...document.querySelectorAll('a[href*="${card.id}"]')][0];
  if(!c)return 'gone';
  const r=c.getBoundingClientRect();
  return JSON.stringify({x:r.x|0,y:r.y|0,col:r.x>590?'Todo':'Backlog'});
})()`));
ws.close();
