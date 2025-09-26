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
'.grid{display:grid; gap:12px; grid-template-columns: repeat(3,minmax(0,1fr))}\n' +
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
'  <!-- Modal for specific day ingest -->\n' +
'  <div id="ingestModal" class="modal-backdrop">\n' +
'    <div class="modal">\n' +
'      <div class="muted" style="font-size:12px;margin-bottom:6px">Pick a day (UTC)</div>\n' +
'      <div class="row">\n' +
'        <input id="ingestDate" type="date">\n' +
'        <button id="ingestRun">Run ingest</button>\n' +
'        <button id="ingestCancel" class="muted" style="background:#0b1220;border:1px solid #26334d">Cancel</button>\n' +
'      </div>\n' +
'    </div>\n' +
'  </div>\n' +
'\n' +
'  <div class="grid" style="margin-top:12px">\n' +
'    <div class="card"><div class="muted">Outbound</div><div class="num" id="outbound">0</div></div>\n' +
'    <div class="card"><div class="muted">Inbound</div><div class="num" id="inbound">0</div></div>\n' +
'    <div class="card"><div class="muted">Total</div><div class="num" id="total">0</div></div>\n' +
'  </div>\n' +
'\n' +
'  <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card"><div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>\n' +
'    <div class="card"><div class="chart-wrap"><canvas id="dirChart"></canvas></div></div>\n' +
'  </div>\n' +
'\n' +
'  <div class="grid" style="grid-template-columns: repeat(3, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card"><div class="muted">Sum Segments</div><div class="num" id="segments">0</div></div>\n' +
'    <div class="card"><div class="muted">Total Price (raw)</div><div class="num" id="priceRaw">0</div></div>\n' +
'    <div class="card"><div class="muted">Total Price (abs)</div><div class="num" id="priceAbs">0</div></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- NEW: Unique Prospects & STOP -->\n' +
'  <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card">\n' +
'      <div class="muted">Unique Prospects (outbound)</div>\n' +
'      <div class="num" id="uniqueProspectsTotal">0</div>\n' +
'      <div class="muted" id="uniqueProspectsSample" style="font-size:12px; margin-top:6px"></div>\n' +
'    </div>\n' +
'    <div class="card">\n' +
'      <div class="muted">STOP (inbound)</div>\n' +
'      <div class="num" id="stopCount">0</div>\n' +
'    </div>\n' +
'  </div>\n' +
'\n' +
'  <!-- NEW: Repeat Responders list -->\n' +
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
'    document.getElementById("outbound").textContent = data.outbound || 0;\n' +
'    document.getElementById("inbound").textContent  = data.inbound  || 0;\n' +
'    document.getElementById("total").textContent    = data.total    || 0;\n' +
'    document.getElementById("segments").textContent = data.sumSegments || 0;\n' +
'    document.getElementById("priceRaw").textContent = data.totalPriceRaw || 0;\n' +
'    document.getElementById("priceAbs").textContent = data.totalPriceAbs || 0;\n' +
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
'    // NEW: Unique Prospects & STOP\n' +
'    document.getElementById("uniqueProspectsTotal").textContent = data.uniqueProspectsTotal || 0;\n' +
'    const sampleDiv = document.getElementById("uniqueProspectsSample");\n' +
'    const list = data.uniqueProspects || [];\n' +
'    const maxShow = 30;\n' +
'    if (list.length){\n' +
'      const shown = list.slice(0, maxShow);\n' +
'      const more  = Math.max(0, (data.uniqueProspectsTotal||0) - shown.length);\n' +
'      sampleDiv.textContent = shown.join(" · ") + (more ? " · … +" + more + " more" : "");\n' +
'    } else {\n' +
'      sampleDiv.textContent = "";\n' +
'    }\n' +
'    document.getElementById("stopCount").textContent = data.stopCount || 0;\n' +
'\n' +
'    // NEW: Repeat Responders list\n' +
'    const rrDiv = document.getElementById("repeatResponders");\n' +
'    rrDiv.innerHTML = "";\n' +
'    const rr = data.repeatResponders || [];\n' +
'    if (rr.length){\n' +
'      const table = document.createElement("table");\n' +
'      table.style.width = "100%";\n' +
'      table.style.borderCollapse = "collapse";\n' +
'      const thead = document.createElement("thead");\n' +
'      const trh = document.createElement("tr");\n' +
'      ["Phone","Replies"].forEach(h=>{ const th=document.createElement("th"); th.textContent=h; th.style.textAlign="left"; th.style.padding="6px 8px"; th.style.color="var(--muted)"; trh.appendChild(th); });\n' +
'      thead.appendChild(trh); table.appendChild(thead);\n' +
'      const tbody = document.createElement("tbody");\n' +
'      rr.forEach(r => {\n' +
'        const tr = document.createElement("tr");\n' +
'        const td1 = document.createElement("td"); td1.textContent = r.phone || "(unknown)"; td1.style.padding="6px 8px";\n' +
'        const td2 = document.createElement("td"); td2.textContent = r.count; td2.style.padding="6px 8px";\n' +
'        tr.appendChild(td1); tr.appendChild(td2); tbody.appendChild(tr);\n' +
'      });\n' +
'      table.appendChild(tbody);\n' +
'      rrDiv.appendChild(table);\n' +
'    } else {\n' +
'      const em = document.createElement("div"); em.className="muted"; em.textContent="No repeat responders in range."; rrDiv.appendChild(em);\n' +
'    }\n' +
'\n' +
'  }catch(e){\n' +
'    errorBox.textContent = e.message || "Failed to load metrics.";\n' +
'  }\n' +
'}\n' +
'\n' +
'function setLoading(v){\n' +
'  document.body.style.pointerEvents = v ? "none" : "auto";\n' +
'  document.body.style.opacity = v ? .7 : 1;\n' +
'}\n' +
'\n' +
'async function refreshToken(){\n' +
'  const t = sessionStorage.getItem("authToken");\n' +
'  if (!t) return;\n' +
'  try{\n' +
'    const r = await fetch("/api/refresh", { method:"POST", headers: { "authorization":"Bearer " + t } });\n' +
'    const j = await r.json().catch(()=>({}));\n' +
'    if (r.ok && j.ok && j.token) sessionStorage.setItem("authToken", j.token);\n' +
'  }catch{}\n' +
'}\n' +
'setInterval(refreshToken, 10 * 60 * 1000);\n' +
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
'  input.max = ymdMax;\n' +
'  input.value = ymdMax;\n' +
'}\n' +
'function openModal(){\n' +
'  setDateLimits();\n' +
'  document.getElementById("ingestModal").style.display="flex";\n' +
'}\n' +
'function closeModal(){\n' +
'  document.getElementById("ingestModal").style.display="none";\n' +
'}\n' +
'document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") closeModal(); });\n' +
'document.getElementById("ingestModal").addEventListener("click", (e)=>{\n' +
'  if (e.target.id === "ingestModal") closeModal();\n' +
'});\n' +
'\n' +
'async function runIngestSpecificDay(){\n' +
'  errorBox.textContent = "";\n' +
'  const t = sessionStorage.getItem("authToken");\n' +
'  if (!t){ errorBox.textContent = "No token. Go back to / and login."; return; }\n' +
'  const input = document.getElementById("ingestDate");\n' +
'  if (!input.value) { errorBox.textContent = "Please pick a valid date (YYYY-MM-DD)."; return; }\n' +
'  const d = input.value; // YYYY-MM-DD\n' +
'  const picked = new Date(d + "T00:00:00Z");\n' +
'  const today = new Date(); today.setUTCHours(0,0,0,0);\n' +
'  if (picked >= today){ errorBox.textContent = "Only yesterday or earlier is allowed."; return; }\n' +
'  setLoading(true);\n' +
'  try{\n' +
'    const r = await fetch("/api/ingest?day=" + d, { method:"POST", headers: { "authorization": "Bearer " + t } });\n' +
'    const j = await r.json().catch(()=>({}));\n' +
'    if (!r.ok){ throw new Error((j && j.error) || "ingest_failed"); }\n' +
'    await loadMetrics();\n' +
'  }catch(e){\n' +
'    errorBox.textContent = e.message || "Ingest failed.";\n' +
'  } finally {\n' +
'    setLoading(false);\n' +
'    closeModal();\n' +
'  }\n' +
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
