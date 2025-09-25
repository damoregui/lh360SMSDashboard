// api/cron/daily-ingest.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { runIngestForTenant } = require('../lib/ingestRunner');

function ymdFromOffset(nowUtcMs, offsetMinutes){
  const d = new Date(nowUtcMs + offsetMinutes*60*1000);
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth()+1).padStart(2,'0');
  const dd   = String(d.getUTCDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}
function yesterdayInUTC(){
  const nowUtc = new Date();
  const y = new Date(nowUtc.getTime() - 24*60*60*1000); // yesterday in UTC
  const yyyy = y.getUTCFullYear();
  const mm   = String(y.getUTCMonth()+1).padStart(2,'0');
  const dd   = String(y.getUTCDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = async (req, res) => {
  try{
    // Optional secret
    const secret = process.env.CRON_SECRET;
    if (secret){
      const hdr = req.headers['x-cron-secret'];
      if (!hdr || hdr !== secret){
        res.statusCode = 401;
        return res.end(JSON.stringify({ ok:false, error:'unauthorized' }));
      }
    }

    const db = await getDb();
    const q = {}; // all tenants
    const tenants = await db.collection('tenants').find(q).limit(100).toArray();

    const day = yesterdayInUTC();
    const results = [];
    for (const tenant of tenants){
      try{
        const r = await runIngestForTenant(db, tenant, day);
        results.push({ ok:true, ...r });
      }catch(e){
        results.push({ ok:false, tenantId: tenant.tenantId, error: e.message || String(e) });
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, day, tenants: tenants.length, results }));
  }catch(e){
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
