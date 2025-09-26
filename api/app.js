// api/app.js
module.exports = (req, res) => {
  try{
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");

    const html = '<!doctype html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
'<title>SMS Dashboard</title>\n' +
'<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n' +
'<style>\n' +
':root { --bg:#0f172a; --muted:#94a3b8; --acc:#22c55e; --err:#ef4444; }\n' +
'*{box-sizing:border-box} html,body{height:100%}\n' +
'body{margin:0; font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:linear-gradient(180deg,#0b1220,#0f172a); color:white; min-height:100vh; padding:24px}\n' +
'.wrap{max-width:1100px; margin:0 auto}\n' +
'h1{font-size:20px;margin:0 0 8px}\n' +
'.sub{color:var(--muted);margin:0 0 20px}\n' +
'.row{display:flex; gap:12px; align-items:end; flex-wrap:wrap}\n' +
'input,button,select{padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,.12); background:#0b1220; color:white; outline:none}\n' +
'button{cursor:pointer; background:linear-gradient(180deg,#22c55e,#16a34a); border:none}\n' +
'.card{background:rgba(255,255,255,.04); border:1px solid rgba(255,255,255,.08); border-radius:20px; padding:16px}\n' +
'.grid{display:grid; gap:12px}\n' +
'.num{font-size:28px; font-weight:700}\n' +
'.muted{color:var(--muted)}\n' +
'.chart-wrap{height:260px}\n' +
'.err{color:var(--err); margin-top:8px; min-height:16px}\n' +
'/* Date inputs: force white calendar icon */\n' +
'#from, #to, #ingestDate { color-scheme: dark; }\n' +
'#from::-webkit-calendar-picker-indicator,\n' +
'#to::-webkit-calendar-picker-indicator,\n' +
'#ingestDate::-webkit-calendar-picker-indicator { filter: invert(1) brightness(1.6); opacity: 1; }\n' +
'/* Modal */\n' +
'.modal-backdrop{position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; justify-content:center; align-items:center; z-index:50}\n' +
'.modal{background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:16px; min-width:300px}\n' +
'.modal .row{align-items:end}\n' +
'/* Repeat responders table */\n' +
'table{border-collapse:collapse; width:100%}\n' +
'thead th{color:var(--muted); text-align:left; padding:6px 8px}\n' +
'tbody td{padding:6px 8px; border-top:1px solid rgba(255,255,255,.08)}\n' +
'.expander{cursor:pointer; opacity:.8}\n' +
'.messages{background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:8px}\n' +
'.msg{padding:6px 8px; border-bottom:1px dashed rgba(255,255,255,.1)}\n' +
'.msg:last-child{border-bottom:none}\n' +
'.ts{color:var(--muted); font-size:12px; margin-right:6px}\n' +
'</style>\n' +
'</head>\n' +
'<body>\n' +
'<div class="wrap">\n' +
'  <h1>SMS Dashboard</h1>\n' +
'  <p class="sub">All UTC. Served by the backend; calls /api/metrics with your session token.</p>\n' +
'\n' +
'  <div class="row">\n' +
'    <div>\n' +
'      <div class="muted" style="font-size:12px">From</div>\n' +
'      <input id="from" type="date">\n' +
'    </div>\n' +
'    <div>\n' +
'      <div class="muted" style="font-size:12px">To</div>\n' +
'      <input id="to" type="date">\n' +
'    </div>\n' +
'    <button id="load">Load metrics</button>\n' +
'    <button id="ingestOpen">Ingest specific day</button>\n' +
'  </div>\n' +
'\n' +
'  <!-- Row de totales: 4 tarjetas -->\n' +
'  <div class="grid" style="grid-template-columns: repeat(4, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card"><div class="muted">Sum Segments</div><div class="num" id="segments">0</div></div>\n' +
'    <div class="card"><div class="muted">STOP (inbound)</div><div class="num" id="stopCount">0</div></div>\n' +
'    <div class="card"><div class="muted">Total Price (abs)</div><div class="num" id="priceAbs">0</div></div>\n' +
'    <div class="card"><div class="muted">Unique Prospects (outbound)</div><div class="num" id="uniqueProspectsTotal">0</div></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- Charts -->\n' +
'  <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card"><div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>\n' +
'    <div class="card"><div class="chart-wrap"><canvas id="dirChart"></canvas></div></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- Repeat Responders con collapse -->\n' +
'  <div class="card" style="margin-top:12px">\n' +
'    <div class="muted">Repeat Responders (&gt;1 replies)</div>\n' +
'    <div id="repeatResponders" style="margin-top:6px"></div>\n' +
'    <div id="e" class="err"></div>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<script>\n' +
'const errorBox = document.getElementById("e");\n' +
'const from = document.getElementById("from");\n' +
'const to = document.getElementById("to");\n' +
'\n' +
'function ymd(d){\n' +
'  const yyyy = d.getUTCFullYear();\n' +
'  const mm = String(d.getUTCMonth()+1).padStart(2,"0");\n' +
'  const dd = String(d.getUTCDate()).padStart(2,"0");\n' +
'  return yyyy + "-" + mm + "-" + dd;\n' +
'}\n' +
'const token = sessionStorage.getItem("authToken") || new URL(location.href).searchParams.get("t");\n' +
'if (token) sessionStorage.setItem("authToken", token);\n' +
'\n' +
'const yesterday = new Date(Date.now() - 86400000);\n' +
'from.value = ymd(yesterday);\n' +
'to.value = ymd(yesterday);\n' +
'\n' +
'let statusChart, dirChart;\n' +
'function fmtTsISO(iso){ try{ const d=new Date(iso); return d.toISOString().replace("T"," ").replace(".000Z","Z"); }catch{ return iso||"" } }\n' +
'function esc(s){ return (s==null?"":String(s)).replace(/[&<>"]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;","\\"":"&quot;" }[c])); }\n' +
'\n' +
'async function loadMetrics(){\n' +
'  errorBox.textContent = "";\n' +
'  const t = sessionStorage.getItem("authToken");\n' +
'  if (!t){ errorBox.textContent = "No token. Go back to / and login."; return; }\n' +
'  const f = from.value.trim();\n' +
'  const tt = to.value.trim();\n' +
'  if (!f || !tt){ errorBox.textContent = "Pick dates."; return; }\n' +
'\n' +
'  try{\n' +
'    const r = await fetch("/api/metrics?from=" + f + "&to=" + tt, { headers: { "authorization":"Bearer " + t } });\n' +
'    const data = await r.json();\n' +
'    if (!r.ok){ throw new Error((data && data.error) || "metrics_failed"); }\n' +
'\n' +
'    document.getElementById("segments").textContent = data.sumSegments || 0;\n' +
'    document.getElementById("stopCount").textContent = data.stopCount || 0;\n' +
'    document.getElementById("priceAbs").textContent = data.totalPriceAbs || 0;\n' +
'    document.getElementById("uniqueProspectsTotal").textContent = data.uniqueProspectsTotal || 0;\n' +
'\n' +
'    const sLabels = Object.keys(data.byStatus || {});\n' +
'    const sData   = sLabels.map(k => data.byStatus[k]);\n' +
'    if (statusChart) statusChart.destroy();\n' +
'    statusChart = new Chart(document.getElementById("statusChart"), {\n' +
'      type: "bar",\n' +
'      data: { labels: sLabels, datasets: [{ data: sData }] },\n' +
'      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }\n' +
'    });\n' +
'\n' +
'    const dLabels = ["Outbound", "Inbound"];\n' +
'    const dData = [data.outbound, data.inbound];\n' +
'    if (dirChart) dirChart.destroy();\n' +
'    dirChart = new Chart(document.getElementById("dirChart"), {\n' +
'      type: "doughnut",\n' +
'      data: { labels: dLabels, datasets: [{ data: dData }] },\n' +
'      options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } } }\n' +
'    });\n' +
'\n' +
'    renderRepeatResponders(data.repeatResponders || [], f, tt);\n' +
'\n' +
'  }catch(e){\n' +
'    errorBox.textContent = e.message || "Failed to load metrics.";\n' +
'  }\n' +
'}\n' +
'\n' +
'function setLoading(v){ document.body.style.pointerEvents = v ? "none" : "auto"; document.body.style.opacity = v ? .7 : 1; }\n' +
'\n' +
'async function refreshToken(){\n' +
'  const t = sessionStorage.getItem("authToken"); if (!t) return;\n' +
'  try{\n' +
'    const r = await fetch("/api/refresh", { method:"POST", headers: { "authorization":"Bearer " + t } });\n' +
'    const j = await r.json().catch(()=>({}));\n' +
'    if (r.ok && j.ok && j.token) sessionStorage.setItem("authToken", j.token);\n' +
'  }catch{}\n' +
'}\n' +
'setInterval(refreshToken, 10 * 60 * 1000);\n' +
'\n' +
'function renderRepeatResponders(rr, f, tt){\n' +
'  const box = document.getElementById("repeatResponders");\n' +
'  box.innerHTML = "";\n' +
'  if (!rr.length){ const em=document.createElement("div"); em.className="muted"; em.textContent="No repeat responders in range."; return void box.appendChild(em); }\n' +
'\n' +
'  const table = document.createElement("table");\n' +
'  const thead = document.createElement("thead");\n' +
'  const trh = document.createElement("tr");\n' +
'  ["Phone","Replies"].forEach(h=>{ const th=document.createElement("th"); th.textContent=h; trh.appendChild(th); });\n' +
'  thead.appendChild(trh); table.appendChild(thead);\n' +
'  const tbody = document.createElement("tbody"); table.appendChild(tbody);\n' +
'\n' +
'  rr.forEach(row => {\n' +
'    const tr = document.createElement("tr"); tr.className = "expander"; tr.dataset.phone = row.phone;\n' +
'    const td1 = document.createElement("td"); td1.textContent = row.phone || "(unknown)";\n' +
'    const td2 = document.createElement("td"); td2.textContent = row.count;\n' +
'    tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr);\n' +
'\n' +
'    const trMsg = document.createElement("tr"); trMsg.style.display = "none";\n' +
'    const tdMsg = document.createElement("td"); tdMsg.colSpan = 2; tdMsg.style.padding = "0 8px 8px";\n' +
'    const holder = document.createElement("div"); holder.className="messages"; holder.textContent="";\n' +
'    tdMsg.appendChild(holder); trMsg.appendChild(tdMsg); tbody.appendChild(trMsg);\n' +
'\n' +
'    let loaded = false; let open = false;\n' +
'    tr.addEventListener("click", async () => {\n' +
'      open = !open; trMsg.style.display = open ? "" : "none";\n' +
'      if (!loaded && open){\n' +
'        holder.textContent = "Loading...";\n' +
'        try{\n' +
'          const t = sessionStorage.getItem("authToken");\n' +
'          const url = "/api/responder?phone=" + encodeURIComponent(row.phone) + "&from=" + encodeURIComponent(f) + "&to=" + encodeURIComponent(tt);\n' +
'          const r = await fetch(url, { headers: { "authorization":"Bearer " + t } });\n' +
'          const j = await r.json();\n' +
'          if (!r.ok || !j.ok){ throw new Error((j && j.error) || "fetch_failed"); }\n' +
'          holder.innerHTML = "";\n' +
'          if (!j.messages || !j.messages.length){ holder.textContent = "No inbound messages for this number."; loaded = true; return; }\n' +
'          j.messages.forEach(m => {\n' +
'            const div = document.createElement("div"); div.className="msg";\n' +
'            const ts = document.createElement("span"); ts.className="ts"; ts.textContent = fmtTsISO(m.dateSentUtc);\n' +
'            const body = document.createElement("span"); body.innerHTML = esc(m.body);\n' +
'            div.appendChild(ts); div.appendChild(body); holder.appendChild(div);\n' +
'          });\n' +
'          loaded = true;\n' +
'        }catch(e){ holder.textContent = (e && e.message) || "Failed to load messages."; }\n' +
'      }\n' +
'    });\n' +
'  });\n' +
'\n' +
'  box.appendChild(table);\n' +
'}\n' +
'\n' +
'// Modal helpers\n' +
'function setDateLimits(){\n' +
'  const input = document.getElementById("ingestDate");\n' +
'  const now = new Date();\n' +
'  const y   = new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()-1);\n' +
'  const yyyy = y.getUTCFullYear();\n' +
'  const mm   = String(y.getUTCMonth()+1).padStart(2,"0");\n' +
'  const dd   = String(y.getUTCDate()).padStart(2,"0");\n' +
'  const ymdMax = yyyy + "-" + mm + "-" + dd;\n' +
'  input.max = ymdMax; input.value = ymdMax;\n' +
'}\n' +
'function openModal(){ setDateLimits(); document.getElementById("ingestModal").style.display="flex"; }\n' +
'function closeModal(){ document.getElementById("ingestModal").style.display="none"; }\n' +
'document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") closeModal(); });\n' +
'document.getElementById("ingestModal").addEventListener("click", (e)=>{ if (e.target.id === "ingestModal") closeModal(); });\n' +
'\n' +
'async function runIngestSpecificDay(){\n' +
'  errorBox.textContent = "";\n' +
'  const t = sessionStorage.getItem("authToken"); if (!t){ errorBox.textContent = "No token. Go back to / and login."; return; }\n' +
'  const input = document.getElementById("ingestDate"); if (!input.value) { errorBox.textContent = "Please pick a valid date (YYYY-MM-DD)."; return; }\n' +
'  const d = input.value; const picked = new Date(d + "T00:00:00Z"); const today = new Date(); today.setUTCHours(0,0,0,0);\n' +
'  if (picked >= today){ errorBox.textContent = "Only yesterday or earlier is allowed."; return; }\n' +
'  setLoading(true);\n' +
'  try{\n' +
'    const r = await fetch("/api/ingest?day=" + d, { method:"POST", headers: { "authorization": "Bearer " + t } });\n' +
'    const j = await r.json().catch(()=>({})); if (!r.ok){ throw new Error((j && j.error) || "ingest_failed"); }\n' +
'    await loadMetrics();\n' +
'  }catch(e){ errorBox.textContent = e.message || "Ingest failed."; }\n' +
'  finally { setLoading(false); closeModal(); }\n' +
'}\n' +
'\n' +
'document.getElementById("load").addEventListener("click", loadMetrics);\n' +
'document.getElementById("ingestOpen").addEventListener("click", openModal);\n' +
'document.getElementById("ingestRun").addEventListener("click", runIngestSpecificDay);\n' +
'document.getElementById("ingestCancel").addEventListener("click", closeModal);\n' +
'\n' +
'loadMetrics();\n' +
'</script>\n' +
'</body>\n' +
'</html>\n';

    res.end(html);
  }catch(e){
    console.error("app_error", e && e.stack || e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error:"app_render_error", detail: e.message || String(e) }));
  }
};
