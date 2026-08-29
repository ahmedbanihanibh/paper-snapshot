const req = async (method, params) => {
  const r = await fetch('http://127.0.0.1:29979/mcp', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:method,arguments:params}})});
  const t = await r.text(); const m = t.match(/data: (.*)/); return JSON.parse(m?m[1]:t);
};
const kids = JSON.parse((await req('get_children',{nodeId:'17E4-0'})).result?.content?.[0]?.text);
const ids = (kids.children??kids).map(c=>c.nodeId??c.id).slice(0,3);
console.log('kids:', ids);
console.log((await req('get_computed_styles',{nodeIds:ids})).result?.content?.[0]?.text?.slice(0,700));
