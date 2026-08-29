// Seed issues into Linear via the real create dialog: c -> insertText -> Meta+Enter
import WebSocket from 'ws';
const tabs = await (await fetch('http://127.0.0.1:9222/json/list')).json();
const tab = tabs.find(t=>t.type==='page'&&/linear\.app/.test(t.url));
const ws = new WebSocket(tab.webSocketDebuggerUrl);
await new Promise(r=>ws.on('open',r));
let id=0; const send=(m,p)=>new Promise(res=>{const mid=++id;ws.send(JSON.stringify({id:mid,method:m,params:p}));const h=x=>{const d=JSON.parse(x);if(d.id===mid){ws.off('message',h);res(d)}};ws.on('message',h)});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const key=async(k,code,kc,mods=0)=>{
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:k,code,windowsVirtualKeyCode:kc,modifiers:mods});
};
const evalJs=async(expr)=>{const r=await send('Runtime.evaluate',{expression:expr,returnByValue:true});return r.result?.result?.value};

const TITLES = [
  "Add SNMP walk caching layer for cold-start polls",
  "Param 1001 shows stale value after trigger fires",
  "Table column widths reset when switching pages in preview",
  "QAction compile diagnostics lose line numbers on net462",
  "Add dark-mode support to the exported XML viewer",
  "This is a deliberately very long issue title that must truncate somewhere in the row because it keeps going and going well past any reasonable column width for a list surface",
  "Write onboarding doc for protocol branches",
  "Investigate flaky trap replay in device simulator",
  "Ship version bump carry-over policy",
  "Spike: Rust engine serial I/O parity check",
];

// make sure no dialog is open
await key('Escape','Escape',27); await sleep(300);

for (const [i,t] of TITLES.entries()) {
  // open create dialog with 'c'
  await key('c','KeyC',67);
  await sleep(900);
  const hasDialog = await evalJs(`!!document.querySelector('[role="dialog"] [contenteditable], [role="dialog"] textarea, [contenteditable="true"]')`);
  if(!hasDialog){ console.log(`#${i+1}: NO DIALOG — aborting`); break; }
  await send('Input.insertText',{text:t});
  await sleep(300);
  // submit: Meta+Enter
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:4});
  await send('Input.dispatchKeyEvent',{type:'keyUp',key:'Enter',code:'Enter',windowsVirtualKeyCode:13,modifiers:4});
  await sleep(1200);
  // verify dialog closed
  const still = await evalJs(`!!document.querySelector('[role="dialog"] [contenteditable]')`);
  console.log(`#${i+1}: "${t.slice(0,40)}" submitted, dialogStillOpen=${still}`);
  if(still){ await key('Escape','Escape',27); await sleep(400); }
}
// count rows now
await sleep(1500);
const count = await evalJs(`document.querySelectorAll('a[href*="/issue/"]').length`);
console.log('rows visible now:', count);
ws.close();
