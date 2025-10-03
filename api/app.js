// api/app.js
module.exports = (req, res) => {
  try{
    res.statusCode = 200;
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control","no-store, no-cache, must-revalidate, max-age=0");

    const html =
'<!doctype html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>\n' +
'<title>SMS Dashboard</title>\n' +
'<link rel="icon" href="data:,">\n' +
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
'#from, #to, #ingestDate { color-scheme: dark; }\n' +
'#from::-webkit-calendar-picker-indicator,\n' +
'#to::-webkit-calendar-picker-indicator,\n' +
'#ingestDate::-webkit-calendar-picker-indicator { filter: invert(1) brightness(1.6); opacity: 1; }\n' +
'.modal-backdrop{position:fixed; inset:0; background:rgba(0,0,0,.6); display:none; justify-content:center; align-items:center; z-index:50}\n' +
'.modal{background:rgba(255,255,255,.06); border:1px solid rgba(255,255,255,.12); border-radius:16px; padding:16px; min-width:300px}\n' +
'.modal .row{align-items:end}\n' +
'table{border-collapse:collapse; width:100%}\n' +
'thead th{color:var(--muted); text-align:left; padding:6px 8px}\n' +
'tbody td{padding:6px 8px; border-top:1px solid rgba(255,255,255,.08)}\n' +
'.expander{cursor:pointer; opacity:.8}\n' +
'.messages{background:rgba(255,255,255,.03); border:1px solid rgba(255,255,255,.06); border-radius:12px; padding:8px}\n' +
'.msg{padding:6px 8px; border-bottom:1px dashed rgba(255,255,255,.1)}\n' +
'.msg:last-child{border-bottom:none}\n' +
'.ts{color:var(--muted); font-size:12px; margin-right:6px}\n' +
'/* Conversación con burbujas */\n' +
'.msgrow{ display:flex; gap:6px; margin:6px 0; }\n' +
'.msgrow.inbound{ justify-content:flex-end; }\n' +
'.bubble{ background:rgba(255,255,255,.05); border:1px solid rgba(255,255,255,.12); padding:8px 10px; border-radius:14px; max-width:70%; }\n' +
'.bubble.out{ border-color: rgba(34,197,94,.5); }\n' +
'.bubble.in{  border-color: rgba(255,255,255,.28); }\n' +
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
'  <!-- Totales -->\n' +
'  <div class="grid" style="grid-template-columns: repeat(5, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card"><div class="muted">Sum Segments</div><div class="num" id="segments">0</div></div>\n' +
'    <div class="card"><div class="muted">STOP (inbound)</div><div class="num" id="stopCount">0</div></div>\n' +
'    <div class="card"><div class="muted">Total Price (abs)</div><div class="num" id="priceAbs">0</div></div>\n' +
'    <div class="card"><div class="muted">Unique Prospects (outbound)</div><div class="num" id="uniqueProspectsTotal">0</div></div>\n' +
'    <div class="card"><div class="muted">Total messages</div><div class="num" id="totalMsgs">0</div></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- Charts -->\n' +
'  <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr)); margin-top:12px">\n' +
'    <div class="card"><div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>\n' +
'    <div class="card"><div class="chart-wrap"><canvas id="dirChart"></canvas></div></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- Errors as cards -->\n' +
'  <div class="card" id="errorsCard" style="margin-top:12px; display:none;">\n' +
'    <div class="muted" style="margin-bottom:8px">Errors (by code)</div>\n' +
'    <div id="errorsGrid" class="grid" style="grid-template-columns: repeat(auto-fill,minmax(220px,1fr));"></div>\n' +
'  </div>\n' +
'\n' +
'  <!-- Repeat Responders -->\n' +
'  <div class="card" style="margin-top:12px">\n' +
'    <div class="muted">Repeat Responders (≥1 replies, excl. STOP)</div>\n' +
'    <div id="repeatResponders" style="margin-top:6px"></div>\n' +
'    <div id="e" class="err"></div>\n' +
'  </div>\n' +
'</div>\n' +
'\n' +
'<script>\n' +
'window.addEventListener("DOMContentLoaded", () => {\n' +
'  const $ = (id) => document.getElementById(id);\n' +
'  const errorBox = $("e");\n' +
'  const from = $("from");\n' +
'  const to = $("to");\n' +
'\n' +
'  function ymd(d){ const yyyy=d.getUTCFullYear(); const mm=String(d.getUTCMonth()+1).padStart(2,"0"); const dd=String(d.getUTCDate()).padStart(2,"0"); return yyyy+"-"+mm+"-"+dd; }\n' +
'  const token = sessionStorage.getItem("authToken") || new URL(location.href).searchParams.get("t");\n' +
'  if (token) sessionStorage.setItem("authToken", token);\n' +
'  if (from && to){ const y=new Date(Date.now()-86400000); from.value=ymd(y); to.value=ymd(y); }\n' +
'\n' +
'  let statusChart, dirChart;\n' +
'  function fmtTsISO(iso){ try{ const d=new Date(iso); return d.toISOString().replace("T"," ").replace(".000Z","Z"); }catch{ return iso||"" } }\n' +
'  function esc(s){ return (s==null?\'\':String(s)).replace(/&/g,\'&amp;\').replace(/</g,\'&lt;\').replace(/>/g,\'&gt;\').replace(/"/g,\'&quot;\'); }\n' +
'function paintSentiment(el, value){ const v=(value||\'\').toLowerCase(); el.textContent=v||\'—\'; el.className=\'badge \'+(v===\'positive\'?\'positive\':(v===\'negative\'?\'negative\':\'manual\')); }\n' +
'async function fetchSentiment(phone, fromDay, toDay){ const t=sessionStorage.getItem(\'authToken\'); const headers={}; if(t) headers[\'authorization\']=\'Bearer \'+t; const url=\'/api/responder?phone=\'+encodeURIComponent(phone)+\'&from=\'+encodeURIComponent(fromDay)+\'&to=\'+encodeURIComponent(toDay); const r=await fetch(url,{headers}); const j=await r.json().catch(()=>({})); if(!r.ok||!j.ok) throw new Error((j&&j.error)||\'responder_fail\'); return j.sentiment||null; }\n' +\n' +
'\n' +
'  async function loadMetrics(){\n' +
'    if (!errorBox) return;\n' +
'    errorBox.textContent = "";\n' +
'    const t = sessionStorage.getItem("authToken");\n' +
'    if (!t){ errorBox.textContent = "No token. Go back to / and login."; return; }\n' +
'    if (!from || !to){ errorBox.textContent = "Missing date inputs in DOM."; return; }\n' +
'    const f = (from.value||"").trim();\n' +
'    const tt = (to.value||"").trim();\n' +
'    if (!f || !tt){ errorBox.textContent = "Pick dates."; return; }\n' +
'    try{\n' +
'      // METRICS\n' +
'      const r = await fetch("/api/metrics?from=" + f + "&to=" + tt, { headers: { "authorization":"Bearer " + t } });\n' +
'      const data = await r.json();\n' +
'      if (!r.ok){ throw new Error((data && data.error) || "metrics_failed"); }\n' +
'      const setNum = (id,val)=>{ const el=$(id); if (el) el.textContent = val||0; };\n' +
'      setNum("segments", data.sumSegments);\n' +
'      setNum("stopCount", data.stopCount);\n' +
'      setNum("priceAbs", data.totalPriceAbs);\n' +
'      setNum("uniqueProspectsTotal", data.uniqueProspectsTotal);\n' +
'      setNum("totalMsgs", (typeof data.total==="number" ? data.total : (data.outbound||0)+(data.inbound||0)));\n' +
'\n' +
'      const sLabels = Object.keys(data.byStatus || {});\n' +
'      const sData   = sLabels.map(k => data.byStatus[k]);\n' +
'      if (statusChart) statusChart.destroy();\n' +
'      if ($("statusChart")){\n' +
'        statusChart = new Chart($("statusChart"), {\n' +
'          type: "bar", data: { labels: sLabels, datasets: [{ data: sData }] },\n' +
'          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } } }\n' +
'        });\n' +
'      }\n' +
'\n' +
'      if (dirChart) dirChart.destroy();\n' +
'      if ($("dirChart")){\n' +
'        const dLabels = ["Outbound","Inbound"]; const dData=[data.outbound, data.inbound];\n' +
'        dirChart = new Chart($("dirChart"), {\n' +
'          type: "doughnut", data: { labels: dLabels, datasets: [{ data: dData }] },\n' +
'          options: { responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:"bottom" } } }\n' +
'        });\n' +
'      }\n' +
'\n' +
'      // ERRORS (cards). Si no hay, ocultamos la card\n' +
'      try{\n' +
'        const er = await fetch("/api/errors?from=" + f + "&to=" + tt, { headers: { "authorization":"Bearer " + t } });\n' +
'        const ej = await er.json();\n' +
'        if (er.ok && ej.ok){ renderErrorsCards(ej.items||[]); } else { renderErrorsCards([]); }\n' +
'      }catch{ renderErrorsCards([]); }\n' +
'\n' +
'      renderRepeatResponders(data.repeatResponders || [], f, tt);\n' +
'    }catch(e){ errorBox.textContent = e.message || "Failed to load metrics."; }\n' +
'  }\n' +
'\n' +
'  function renderErrorsCards(items){\n' +
'    const card = $("errorsCard"); const grid = $("errorsGrid"); if (!card || !grid) return;\n' +
'    grid.innerHTML = "";\n' +
'    if (!items.length){ card.style.display = "none"; return; }\n' +
'    card.style.display = "";\n' +
'    items.sort((a,b)=> (b.count||0)-(a.count||0)).forEach(it => {\n' +
'      const c = document.createElement("div"); c.className = "card";\n' +
'      const num = document.createElement("div"); num.className = "num"; num.textContent = it.count || 0;\n' +
'      const cap = document.createElement("div"); cap.className = "muted"; cap.textContent = "Code " + (it.code||"?") + " — " + (it.description||"See Twilio docs");\n' +
'      c.appendChild(num); c.appendChild(cap); grid.appendChild(c);\n' +
'    });\n' +
'  }\n' +
'\n' +
'  function setLoading(v){ document.body.style.pointerEvents = v ? "none" : "auto"; document.body.style.opacity = v ? .7 : 1; }\n' +
'  async function refreshToken(){ const t = sessionStorage.getItem("authToken"); if (!t) return; try{ const r = await fetch("/api/refresh", { method:"POST", headers: { "authorization":"Bearer " + t } }); const j = await r.json().catch(()=>({})); if (r.ok && j.ok && j.token) sessionStorage.setItem("authToken", j.token); }catch{} }\n' +
'  setInterval(refreshToken, 10 * 60 * 1000);\n' +
'\n' +
'  function renderRepeatResponders(rr, f, tt){\n' +
'  const box = $("repeatResponders"); if (!box) return; box.innerHTML = "";\n' +
'  if (!rr.length){ const em=document.createElement("div"); em.className="muted"; em.textContent="No responders in range."; box.appendChild(em); return; }\n' +
'  const table=document.createElement("table"); const thead=document.createElement("thead"); const trh=document.createElement("tr");\n' +
'  ["Phone","Replies","Sentiment"].forEach(h=>{ const th=document.createElement("th"); th.textContent=h; trh.appendChild(th); }); thead.appendChild(trh); table.appendChild(thead);\n' +
'  const tbody=document.createElement("tbody"); table.appendChild(tbody);\n' +
'\n' +
'  rr.forEach((row, i)=>{\n' +
'    const tr=document.createElement("tr"); tr.className="expander"; tr.dataset.phone=row.phone;\n' +
'    const td1=document.createElement("td"); td1.textContent=row.phone||"(unknown)";\n' +
'    const td2=document.createElement("td"); td2.textContent=row.count; td2.style.textAlign="right";\n' +
'    const td3=document.createElement("td"); td3.style.textAlign="right"; const badge=document.createElement("span"); badge.className="badge manual"; badge.textContent="—"; td3.appendChild(badge);\n' +
'    if (row.sentiment) paintSentiment(badge, row.sentiment);\n' +
'    tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tbody.appendChild(tr);\n' +
'\n' +
'    // Toggle existing details (reuses original click behavior from this app)\n' +
'    const trMsg=document.createElement("tr"); trMsg.style.display="none"; const tdMsg=document.createElement("td"); tdMsg.colSpan=3; tdMsg.style.padding="0 8px 8px";\n' +
'    const holder=document.createElement("div"); holder.className="messages"; holder.textContent=""; tdMsg.appendChild(holder); trMsg.appendChild(tdMsg); tbody.appendChild(trMsg);\n' +
'    let loaded=false, open=false;\n' +
'\n' +
'    tr.addEventListener("click", async ()=>{\n' +
'      open=!open; trMsg.style.display=open?"":"none";\n' +
'      if (!loaded && open){\n' +
'        holder.textContent="Loading...";\n' +
'        try{\n' +
'          const t=sessionStorage.getItem("authToken");\n' +
'          const url="/api/responder?phone="+encodeURIComponent(row.phone)+"&from="+encodeURIComponent(f)+"&to="+encodeURIComponent(tt);\n' +
'          const r=await fetch(url,{ headers:{ "authorization":"Bearer "+t }});\n' +
'          const j=await r.json(); if(!r.ok||!j.ok) throw new Error((j&&j.error)||"fetch_failed");\n' +
'          holder.innerHTML="";\n' +
'          if(!j.messages||!j.messages.length){ holder.textContent="No messages for this number."; loaded=true; return; }\n' +
'          j.messages.forEach(m=>{\n' +
'            const rowEl=document.createElement("div"); rowEl.className="msgrow " + (m.direction==="inbound" ? "inbound" : "outbound");\n' +
'            const ts=document.createElement("span"); ts.className="ts"; ts.textContent=fmtTsISO(m.dateSentUtc);\n' +
'            const bubble=document.createElement("div"); bubble.className="bubble " + (m.direction==="inbound" ? "in" : "out"); bubble.innerHTML=esc(m.body);\n' +
'            rowEl.appendChild(ts); rowEl.appendChild(bubble); holder.appendChild(rowEl);\n' +
'          });\n' +
'          if (j.sentiment) paintSentiment(badge, j.sentiment);\n' +
'          loaded=true;\n' +
'        }catch(e){ holder.textContent=(e&&e.message)||"Failed to load messages."; }\n' +
'      }\n' +
'    });\n' +
'\n' +
'    if (!row.sentiment){\n' +
'      setTimeout(async () => {\n' +
'        try{\n' +
'          const s = await fetchSentiment(row.phone, f, tt);\n' +
'          if (s) paintSentiment(badge, s);\n' +
'        }catch{}\n' +
'      }, 50 * i);\n' +
'    }\n' +
'  });\n' +
'  box.appendChild(table);\n' +
'}\n' +
'\n' +
'  function setDateLimits(){ const input=$("ingestDate"); if(!input) return; const now=new Date(); const y=new Date(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()-1); const yyyy=y.getUTCFullYear(); const mm=String(y.getUTCMonth()+1).padStart(2,"0"); const dd=String(y.getUTCDate()).padStart(2,"0"); const ymdMax=yyyy+"-"+mm+"-"+dd; input.max=ymdMax; input.value=ymdMax; }\n' +
'  function openModal(){ setDateLimits(); const m=$("ingestModal"); if(m) m.style.display="flex"; }\n' +
'  function closeModal(){ const m=$("ingestModal"); if(m) m.style.display="none"; }\n' +
'  document.addEventListener("keydown", (e)=>{ if (e.key==="Escape") closeModal(); });\n' +
'  const modalEl = $("ingestModal"); if (modalEl) modalEl.addEventListener("click", (e)=>{ if (e.target.id==="ingestModal") closeModal(); });\n' +
'\n' +
'  async function runIngestSpecificDay(){\n' +
'    if (!errorBox) return;\n' +
'    errorBox.textContent=""; const t=sessionStorage.getItem("authToken"); if(!t){ errorBox.textContent="No token. Go back to / and login."; return; }\n' +
'    const input=$("ingestDate"); if(!input||!input.value){ errorBox.textContent="Please pick a valid date (YYYY-MM-DD)."; return; }\n' +
'    const d=input.value; const picked=new Date(d+"T00:00:00Z"); const today=new Date(); today.setUTCHours(0,0,0,0); if(picked>=today){ errorBox.textContent="Only yesterday or earlier is allowed."; return; }\n' +
'    setLoading(true);\n' +
'    try{ const r=await fetch("/api/ingest?day="+d,{ method:"POST", headers:{ "authorization":"Bearer "+t }}); const j=await r.json().catch(()=>({})); if(!r.ok) throw new Error((j&&j.error)||"ingest_failed"); await loadMetrics(); }\n' +
'    catch(e){ errorBox.textContent=e.message||"Ingest failed."; }\n' +
'    finally{ setLoading(false); closeModal(); }\n' +
'  }\n' +
'\n' +
'  const btnLoad=$("load"); if (btnLoad) btnLoad.addEventListener("click", loadMetrics);\n' +
'  const btnOpen=$("ingestOpen"); if (btnOpen) btnOpen.addEventListener("click", openModal);\n' +
'  const btnRun=$("ingestRun"); if (btnRun) btnRun.addEventListener("click", runIngestSpecificDay);\n' +
'  const btnCancel=$("ingestCancel"); if (btnCancel) btnCancel.addEventListener("click", closeModal);\n' +
'\n' +
'  loadMetrics();\n' +
'});\n' +
'</script>\n' +
'\n' +
'<!-- Modal -->\n' +
'<div id="ingestModal" class="modal-backdrop">\n' +
'  <div class="modal">\n' +
'    <div class="muted" style="font-size:12px;margin-bottom:6px">Pick a day (UTC)</div>\n' +
'    <div class="row">\n' +
'      <input id="ingestDate" type="date">\n' +
'      <button id="ingestRun">Run ingest</button>\n' +
'      <button id="ingestCancel" class="muted" style="background:#0b1220;border:1px solid #26334d">Cancel</button>\n' +
'    </div>\n' +
'  </div>\n' +
'</div>\n' +
'</body>\n' +
'</html>\n';

    res.end(html);
  }catch(e){
    console.error("app_error", e && e.stack || e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error:"app_render_error", detail: e.message || String(e) }));
  }
};
