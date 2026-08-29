// open localhost:5178 in a new tab via CDP
const r = await fetch('http://127.0.0.1:9222/json/new?http://localhost:5178/', {method:'PUT'});
console.log(await r.text());
