// api/ingest.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const { runIngestForTenant } = require('../lib/ingestRunner');

function parseDayParam(q){
  const day = (q.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}
function ymdUTC(d){ // YYYY-MM-DD in UTC
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth()+1).padStart(2,'0');
  const dd   = String(d.getUTCDate()).padStart(2,'0');
  return `${yyyy}-${mm}-${dd}`;
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'POST'){
      res.setHeader('Allow','POST');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'Method Not Allowed' }));
    }

    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    let day = parseDayParam(req.query || {});
    if (!day){
      const y = new Date(Date.now() - 86400000); // yesterday (UTC)
      day = ymdUTC(y);
    }

    const db = await getDb();
    const tenant = await db.collection('tenants').findOne({ tenantId });
    if (!tenant){
      res.statusCode=400;
      return res.end(JSON.stringify({ ok:false, error:'tenant_not_found' }));
    }

    const result = await runIngestForTenant(db, tenant, day);
    res.statusCode=200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, ...result }));
  }catch(e){
    console.error('ingest_error', e && e.stack || e);
    const status = e.message === 'invalid_token' ? 401 : 500;
    res.statusCode = status;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
