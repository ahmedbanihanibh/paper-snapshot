const req = async (method, params) => {
  const r = await fetch('http://127.0.0.1:29979/mcp', {method:'POST',headers:{'Content-Type':'application/json','Accept':'application/json, text/event-stream'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'tools/call',params:{name:method,arguments:params}})});
  const t = await r.text(); const m = t.match(/data: (.*)/); return JSON.parse(m?m[1]:t);
};
const expect = {'1992-0':[220,695],'19JW-0':[225,521],'19QC-0':[209,611],'19Y3-0':[207,274],'1A1P-0':[207,232],'1A42-0':[175,109]};
const res = JSON.parse((await req('get_computed_styles',{nodeIds:Object.keys(expect)})).result?.content?.[0]?.text);
for (const [nid,[w,h]] of Object.entries(expect)) {
  const s=res.styles[nid];
  const ok = s && parseInt(s.width)===w && parseInt(s.height)===h;
  console.log(nid, s?.width, s?.height, ok?'✓':'MISMATCH expected '+w+'x'+h);
}
