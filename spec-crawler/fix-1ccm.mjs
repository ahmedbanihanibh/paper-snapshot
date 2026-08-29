const req = async (method, params) => {
  const r = await fetch('http://127.0.0.1:29979/mcp', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:method,arguments:params}})});
  const t = await r.text(); const m = t.match(/data: (.*)/); return JSON.parse(m?m[1]:t);
};
const up = await req('update_styles',{styles:{'1CCM-0':{width:'1432px',height:'900px'}}});
console.log('resize:', JSON.stringify(up.result?.content?.[0]?.text ?? up).slice(0,200));
const res = JSON.parse((await req('get_computed_styles',{nodeIds:['1AVU-0','1CCM-0']})).result?.content?.[0]?.text);
for (const nid of ['1AVU-0','1CCM-0']) console.log(nid, res.styles[nid]?.width, res.styles[nid]?.height);
