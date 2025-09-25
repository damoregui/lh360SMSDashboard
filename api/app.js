// api/app.js
module.exports = (req, res) => {
  try{
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.end(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>SMS Dashboard</title>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<style>
:root { --bg:#0f172a; --muted:#94a3b8; --acc:#22c55e; --err:#ef4444; }
*{box-sizing:border-box} html,body{height:100%}
body{margin:0; font-family:Inter,system-ui,Segoe UI,Roboto,Helvetica,Arial,sans-serif; background:linear-gradient(180deg,#0b1220,#0f172a); color:white; min-height:100vh; padding:24px}
.wrap{max-width:1100px; margin:0 auto}
h1{font-size:24px; margin:0 0 6px}
p.sub{margin:0 0 14px; color:var(--muted); font-size:13px}
.row{display:flex; gap:10px; flex-wrap:wrap; align-items:end}
input{padding:10px 12px; border-radius:12px; border:1px solid rgba(255,255,255,0.12); background:#0b1220; color:white; outline:none}
button{padding:10px 14px; border-radius:12px; border:none; background:linear-gradient(135deg,#22c55e,#16a34a); color:white; font-weight:600; cursor:pointer}
.grid{display:grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap:12px; margin:16px 0}
.card{background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); border-radius:20px; padding:16px}
.num{font-size:28px; font-weight:700}
.muted{color:var(--muted)}
/* === FIX charts shrink === */
canvas{
  background:#0b1220;
  border-radius:16px;
  box-sizing: content-box;   /* evita loop con border-box */
  display:block;
  width:100% !important;
  height:100% !important;
}
/* wrapper con altura fija + padding/borde */
.chart-wrap{
  height:260px; /* ajustable */
  border:1px solid rgba(255,255,255,0.08);
  border-radius:16px;
  padding:8px;
  background:#0b1220;
}
.err{color:var(--err); margin-top:10px}
.loader{position:fixed; inset:0; display:flex; align-items:center; justify-content:center; background:rgba(0,0,0,.35); z-index:9999}
.loader.hidden{display:none}
.spinner{width:48px; height:48px; border:4px solid rgba(255,255,255,.2); border-top-color:#22c55e; border-radius:50%; animation:spin 1s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
button[disabled]{opacity:.6; cursor:not-allowed}
</style>
</head>
<body>
<div id="loader" class="loader hidden"><div class="spinner"></div></div>
<div class="wrap">
  <h1>Twilio SMS Dashboard</h1>
  <p class="sub">All UTC. Served by the backend; calls /api/metrics with your session token.</p>
  <div class="row">
    <div>
      <div class="muted" style="font-size:12px">From</div>
      <input id="from" type="date">
    </div>
    <div>
      <div class="muted" style="font-size:12px">To</div>
      <input id="to" type="date">
    </div>
    <button id="load">Load metrics</button>
    <button id="ingestOpen">Ingest specific day</button>
  
    <div id="ingestMenu" style="display:none; gap:8px; align-items:end; margin-top:8px">
      <div>
        <div class="muted" style="font-size:12px">Pick a day (UTC)</div>
        <input id="ingestDate" type="date">
      </div>
      <button id="ingestRun">Run ingest</button>
      <button id="ingestCancel" class="muted" style="background:#0b1220;border:1px solid #26334d">Cancel</button>
    </div>


  <div class="grid">
    <div class="card"><div class="muted">Outbound</div><div class="num" id="outbound">0</div></div>
    <div class="card"><div class="muted">Inbound</div><div class="num" id="inbound">0</div></div>
    <div class="card"><div class="muted">Total</div><div class="num" id="total">0</div></div>
  </div>

  <div class="grid" style="grid-template-columns: repeat(2, minmax(0,1fr));">
    <div class="card"><div class="chart-wrap"><canvas id="statusChart"></canvas></div></div>
    <div class="card"><div class="chart-wrap"><canvas id="dirChart"></canvas></div></div>
  </div>

  <div class="grid" style="grid-template-columns: repeat(3, minmax(0,1fr));">
    <div class="card"><div class="muted">Sum Segments</div><div class="num" id="segments">0</div></div>
    <div class="card"><div class="muted">Total Price (raw)</div><div class="num" id="priceRaw">0</div></div>
    <div class="card"><div class="muted">Total Price (abs)</div><div class="num" id="priceAbs">0</div></div>
  </div>

  <div class="card">
    <div class="muted">Errors (by code)</div>
    <div id="errors"></div>
  </div>

  <div class="err" id="errorBox"></div>
</div>

<script>
function fmt(n){ return new Intl.NumberFormat('en-US', { maximumFractionDigits: 5 }).format(n) }
function ymd(d){ return d.toISOString().slice(0,10) }
const from = document.getElementById('from');
const to = document.getElementById('to');
const errorBox = document.getElementById('errorBox');
const loader = document.getElementById('loader');
const btnLoad = document.getElementById('load');
const btnIngest = document.getElementById('ingest');

function setLoading(on){
  loader.classList.toggle('hidden', !on);
  btnLoad.disabled = btnIngest.disabled = !!on;
}

const token = sessionStorage.getItem('authToken') || new URL(location.href).searchParams.get('t');
if (token) sessionStorage.setItem('authToken', token);

const yesterday = new Date(Date.now() - 86400000);
from.value = ymd(yesterday);
to.value = ymd(yesterday);

let statusChart, dirChart;

async function loadMetrics(){
  errorBox.textContent = '';
  const t = sessionStorage.getItem('authToken');
  if (!t){ errorBox.textContent = 'No token. Go back to / and login.'; return; }
  setLoading(true);
  try{
    const url = '/api/metrics?from=' + from.value + '&to=' + to.value;
    const r = await fetch(url, { headers: { 'authorization': 'Bearer ' + t } });
    const data = await r.json().catch(()=>({}));
    if (!r.ok){ errorBox.textContent = (data && data.error) || 'Failed to load metrics'; return; }

    document.getElementById('outbound').textContent = data.outbound;
    document.getElementById('inbound').textContent = data.inbound;
    document.getElementById('total').textContent = data.total;

    document.getElementById('segments').textContent = data.sumSegments;
    document.getElementById('priceRaw').textContent = fmt(data.totalPriceRaw);
    document.getElementById('priceAbs').textContent = fmt(data.totalPriceAbs);

    const sLabels = Object.keys(data.byStatus || {});
    const sData = Object.values(data.byStatus || {});
    const colors = ['#0ea5e9','#22c55e','#a855f7','#f59e0b','#ef4444','#10b981','#3b82f6','#e11d48','#64748b'];
    if (statusChart) statusChart.destroy();
    statusChart = new Chart(document.getElementById('statusChart'), {
      type: 'bar',
      data: { labels: sLabels, datasets: [{ label: 'Status', data: sData, backgroundColor: colors }] },
      options: {
        responsive:true,
        maintainAspectRatio:false,   // importante
        plugins:{ legend:{ display:false } },
        scales:{ y: { beginAtZero:true } }
      }
    });

    const dLabels = ['Outbound','Inbound'];
    const dData = [data.outbound, data.inbound];
    if (dirChart) dirChart.destroy();
    dirChart = new Chart(document.getElementById('dirChart'), {
      type: 'doughnut',
      data: { labels: dLabels, datasets: [{ data: dData, backgroundColor: ['#22c55e','#0ea5e9'] }] },
      options: {
        responsive:true,
        maintainAspectRatio:false,   // importante
        plugins:{ legend:{ position:'bottom' } }
      }
    });

    const errDiv = document.getElementById('errors');
    errDiv.innerHTML = '';
    const entries = Object.entries(data.byError || {}).sort((a,b)=> b[1]-a[1]);
    if (!entries.length){ errDiv.textContent = 'No errors in range.'; }
    else{
      const ul = document.createElement('ul');
      for (const [code,count] of entries){
        const li = document.createElement('li');
        li.textContent = code + ': ' + count;
        ul.appendChild(li);
      }
      errDiv.appendChild(ul);
    }
  } finally { setLoading(false); }
}

  setLoading(true);
  try{
    const d = ymd(new Date(Date.now() - 86400000));
    const r = await fetch('/api/ingest?day=' + d, { method:'POST', headers: { 'authorization': 'Bearer ' + t } });
    const j = await r.json().catch(()=>({}));
    if (!r.ok){ errorBox.textContent = (j && j.error) || 'ingest failed'; return; }
    await loadMetrics();
  } finally { setLoading(false); }
}

async function refreshToken(){
  const t = sessionStorage.getItem('authToken');
  if (!t) return;
  try{
    const r = await fetch('/api/refresh', { method:'POST', headers: { 'authorization':'Bearer ' + t } });
    const j = await r.json().catch(()=>({}));
    if (r.ok && j.ok && j.token) sessionStorage.setItem('authToken', j.token);
  }catch{}
}
setInterval(refreshToken, 10 * 60 * 1000);

document.getElementById('load').addEventListener('click', loadMetrics);
document.getElementById('ingestOpen').addEventListener('click', showIngestMenu);
document.getElementById('ingestRun').addEventListener('click', runIngestSpecificDay);
document.getElementById('ingestCancel').addEventListener('click', hideIngestMenu);
loadMetrics();

function setDateLimits(){
  const input = document.getElementById('ingestDate');
  const now = new Date();
  const y   = new Date(now.getFullYear(), now.getMonth(), now.getDate()-1);
  const yyyy = y.getFullYear();
  const mm   = String(y.getMonth()+1).padStart(2,'0');
  const dd   = String(y.getDate()).padStart(2,'0');
  const ymd  = `${yyyy}-${mm}-${dd}`;
  input.max = ymd;         // no hoy ni futuro
  input.value = ymd;       // por default: ayer
}

function showIngestMenu(){
  errorBox.textContent = '';
  setDateLimits();
  document.getElementById('ingestMenu').style.display='flex';
}
function hideIngestMenu(){
  document.getElementById('ingestMenu').style.display='none';
}

async function runIngestSpecificDay(){
  errorBox.textContent = '';
  const t = sessionStorage.getItem('authToken');
  if (!t){ errorBox.textContent = 'No token. Go back to / and login.'; return; }
  const input = document.getElementById('ingestDate');
  const d = (input.value||'').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)){
    errorBox.textContent = 'Please pick a valid date (YYYY-MM-DD).';
    return;
  }
  // validate not today/future
  const today = new Date(); today.setHours(0,0,0,0);
  const picked = new Date(d + 'T00:00:00');
  const diffDays = Math.round((picked - today)/(24*60*60*1000));
  if (diffDays >= 0){
    errorBox.textContent = 'Only yesterday or earlier is allowed.';
    return;
  }
  setLoading(true);
  try{
    const r = await fetch('/api/ingest?day=' + d, { method:'POST', headers: { 'authorization': 'Bearer ' + t } });
    const j = await r.json().catch(()=>({}));
    if (!r.ok){
      throw new Error(j && j.error || 'ingest_failed');
    }
    await loadMetrics();
  }catch(e){
    errorBox.textContent = e.message || 'Ingest failed.';
  } finally {
    setLoading(false);
    hideIngestMenu();
  }
}

</script>
</body>
</html>`);
  }catch(e){
    console.error('app_error', e && e.stack || e);
    res.statusCode = 500;
    res.end(JSON.stringify({ ok:false, error:'app_render_error', detail: e.message || String(e) }));
  }
};
