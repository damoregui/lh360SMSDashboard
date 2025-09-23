// api/metrics.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

function parseDate(s){
  const m = /^\d{4}-\d{2}-\d{2}$/.exec(String(s||'').trim());
  return m ? s : null;
}
function rangeUtc(from, to){
  const f = new Date(from + 'T00:00:00.000Z');
  const e = new Date(to   + 'T23:59:59.999Z');
  return { start:f, end:e };
}
const OUTBOUND_SET = new Set(['outbound','outbound-api','outgoing']);
const INBOUND_SET = new Set(['inbound']);

module.exports = async (req, res) => {
  if (req.method !== 'GET'){ res.setHeader('Allow','GET'); res.statusCode=405; return res.end(JSON.stringify({ok:false,error:'Method Not Allowed'})); }
  try{
    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    const from = parseDate(req.query.from) || new Date().toISOString().slice(0,10);
    const to   = parseDate(req.query.to)   || from;
    const { start, end } = rangeUtc(from, to);

    const db = await getDb();
    const cur = db.collection('messages').find(
      { tenantId, dateSentUtc: { $gte: start, $lte: end } },
      { projection: { direction:1, status:1, errorCode:1, numSegments:1, price:1 } }
    );

    let outbound=0, inbound=0, total=0, sumSegments=0, totalPriceRaw=0;
    const byStatus = Object.create(null);
    const byError  = Object.create(null);

    for await (const m of cur){
      total++;
      const dir = String(m.direction||'').toLowerCase();
      if (OUTBOUND_SET.has(dir)) outbound++;
      else if (INBOUND_SET.has(dir)) inbound++;

      const st = String(m.status || 'unknown');
      byStatus[st] = (byStatus[st]||0)+1;

      if (m.errorCode != null){
        const ec = String(m.errorCode);
        byError[ec] = (byError[ec]||0)+1;
      }

      sumSegments += Number(m.numSegments || 0);
      const price = (m.price == null) ? 0 : Number(m.price);
      totalPriceRaw += (isNaN(price) ? 0 : price);
    }

    const totalPriceAbs = Math.abs(totalPriceRaw);

    res.statusCode=200; res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, from, to, total, outbound, inbound, sumSegments, totalPriceRaw, totalPriceAbs, byStatus, byError }));
  }catch(e){
    const status = e.message === 'invalid_token' ? 401 : 500;
    res.statusCode = status;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
