const req = async (method, params) => {
  const r = await fetch('http://127.0.0.1:29979/mcp', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:method,arguments:params}})});
  const t = await r.text(); const m = t.match(/data: (.*)/); return JSON.parse(m?m[1]:t);
};
for (const nid of ['18DP-0','18T7-0']) {
  const st = JSON.parse((await req('get_computed_styles',{nodeIds:[nid]})).result?.content?.[0]?.text).styles[nid];
  const kids = JSON.parse((await req('get_children',{nodeId:nid})).result?.content?.[0]?.text);
  const kid = (kids.children??kids)[0]; const kidId = kid.nodeId??kid.id;
  const ks = JSON.parse((await req('get_computed_styles',{nodeIds:[kidId]})).result?.content?.[0]?.text).styles[kidId];
  console.log(nid, st.width, st.height, 'ground:', ks.backgroundColor);
}
