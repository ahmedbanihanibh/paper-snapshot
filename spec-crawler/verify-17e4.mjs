const req = async (method, params) => {
  const r = await fetch('http://127.0.0.1:29979/mcp', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:method,arguments:params}})});
  const t = await r.text(); const m = t.match(/data: (.*)/); return JSON.parse(m?m[1]:t);
};
console.log((await req('get_computed_styles',{nodeIds:['17E4-0']})).result?.content?.[0]?.text?.slice(0,500));
