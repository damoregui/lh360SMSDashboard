// api/metrics.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

function ymdUTC(d){
  const yyyy = d.getUTCFullYear();
  const mm   = String(d.getUTCMonth()+1).padStart(2, '0');
  const dd   = String(d.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
function rangeUtc(from, to){
  // [start, end) fin exclusivo
  const start = new Date(from + 'T00:00:00.000Z');
  const end   = new Date(new Date(to + 'T00:00:00.000Z').getTime() + 24*60*60*1000);
  return { start, end };
}
function parseDates(q){
  let { from, to } = q || {};
  from = (from || '').trim();
  to   = (to   || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)){
    const y = new Date(Date.now() - 86400000);
    const d = ymdUTC(y);
    from = d; to = d;
  }
  return { from, to, ...rangeUtc(from, to) };
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'GET'){
      res.setHeader('Allow', 'GET');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'Method Not Allowed' }));
    }

    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;
    const { from, to, start, end } = parseDates(req.query || {});
    const db = await getDb();
    const col = db.collection('messages');

    const baseMatch     = { tenantId, dateSentUtc: { $gte: start, $lt: end } };
    const outboundMatch = { ...baseMatch, direction: { $ne: 'inbound' } };
    const inboundMatch  = { ...baseMatch, direction: 'inbound' };

    // Conteos básicos
    const [total, outbound, inbound] = await Promise.all([
      col.countDocuments(baseMatch),
      col.countDocuments(outboundMatch),
      col.countDocuments(inboundMatch),
    ]);

    // Sumas
    const [segAgg] = await col.aggregate([
      { $match: baseMatch },
      { $group: { _id: null, s: { $sum: "$numSegments" } } }
    ]).toArray();
    const sumSegments = segAgg?.s || 0;

    const [priceAgg] = await col.aggregate([
      { $match: baseMatch },
      { $group: {
        _id: null,
        raw: { $sum: "$price" },
        abs: { $sum: { $abs: "$price" } }
      } }
    ]).toArray();
    const totalPriceRaw = priceAgg?.raw || 0;
    const totalPriceAbs = priceAgg?.abs || 0;

    // By status
    const byStatusArr = await col.aggregate([
      { $match: baseMatch },
      { $group: { _id: "$status", c: { $sum: 1 } } }
    ]).toArray();
    const byStatus = {};
    for (const r of byStatusArr) byStatus[r._id || 'unknown'] = r.c;

    // By error (códigos != null)
    const byErrorArr = await col.aggregate([
      { $match: { ...baseMatch, errorCode: { $ne: null } } },
      { $group: { _id: "$errorCode", c: { $sum: 1 } } },
      { $sort: { c: -1 } }
    ]).toArray();
    const byError = {};
    for (const r of byErrorArr) byError[String(r._id)] = r.c;

    // NEW: Repeat responders (>1) — inbound agrupado por "from"
    const repeatResponders = await col.aggregate([
      { $match: inboundMatch },
      { $group: { _id: "$from", count: { $sum: 1 } } },
      { $match: { count: { $gt: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 200 }
    ]).toArray();
    const repeatList = repeatResponders.map(r => ({ phone: r._id, count: r.count }));

    // NEW: Unique prospects (destinatarios únicos outbound "to")
    const uniqueProsAgg = await col.aggregate([
      { $match: outboundMatch },
      { $group: { _id: "$to" } },
      { $sort: { _id: 1 } },
      { $group: { _id: null, numbers: { $push: "$_id" }, total: { $sum: 1 } } },
      { $project: { _id: 0, total: 1, numbers: { $slice: ["$numbers", 200] } } } // muestra hasta 200
    ]).toArray();
    const uniqueProspectsTotal = uniqueProsAgg?.[0]?.total || 0;
    const uniqueProspects      = uniqueProsAgg?.[0]?.numbers || [];

    // NEW: STOP count (inbound con palabra "stop")
    const stopRegex = new RegExp("\\bstop\\b", "i"); // palabra completa, insensible a may/min
    const stopCount = await col.countDocuments({ ...inboundMatch, body: { $regex: stopRegex } });

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({
      ok: true,
      from, to,
      total, outbound, inbound,
      sumSegments, totalPriceRaw, totalPriceAbs,
      byStatus, byError,
      repeatResponders: repeatList,
      uniqueProspectsTotal,
      uniqueProspects,
      stopCount
    }));
  }catch(e){
    console.error('metrics_error', e && e.stack || e);
    res.statusCode = e.message === 'invalid_token' ? 401 : 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
