const req = async (method, params) => {
  const r = await fetch('http://127.0.0.1:29979/mcp', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:method,arguments:params}})});
  const t = await r.text(); const m = t.match(/data: (.*)/); return JSON.parse(m?m[1]:t);
};
const s = JSON.parse((await req('get_computed_styles',{nodeIds:['1A5Z-0']})).result?.content?.[0]?.text).styles['1A5Z-0'];
console.log('1A5Z-0', s.width, s.height);
const kids = JSON.parse((await req('get_children',{nodeId:'1A5Z-0'})).result?.content?.[0]?.text);
const kid=(kids.children??kids)[0]; const kidId=kid.nodeId??kid.id;
console.log('ground:', JSON.parse((await req('get_computed_styles',{nodeIds:[kidId]})).result?.content?.[0]?.text).styles[kidId].backgroundColor);
