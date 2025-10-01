// api/metrics.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

// Buscamos cualquier "stop" (sin boundary) para no perdernos STOP/Stop/stop.
const STOP_REGEX = 'stop';

function parseDay(s){
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(s + 'T00:00:00.000Z') : null;
}
function rangeUtc(from, to){
  const start = parseDay(from), end0 = parseDay(to);
  if (!start || !end0) return null;
  return { start, end: new Date(end0.getTime() + 24*60*60*1000) }; // fin exclusivo
}
const getQ = (q, k) => Array.isArray(q?.[k]) ? q[k][0] : (q?.[k] || '').trim();

module.exports = async (req, res) => {
  try{
    if (req.method !== 'GET'){
      res.setHeader('Allow','GET');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'method_not_allowed' }));
    }

    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    const from = getQ(req.query, 'from');
    const to   = getQ(req.query,   'to');
    const rng  = rangeUtc(from, to);
    if (!rng){
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'bad_date' }));
    }

    const db = await getDb();
    const col = db.collection('messages');

    // Expresiones comunes para usar en $expr
    const BODY_EXPR = { $ifNull: ['$body', { $ifNull: ['$Body', ''] }] };
    const FROM_EXPR = { $ifNull: ['$from', { $ifNull: ['$From', null] }] };

    const facets = await col.aggregate([
      { $match: { tenantId, dateSentUtc: { $gte: rng.start, $lt: rng.end } } },
      { $facet: {
        dirCounts: [
          { $group: { _id: '$direction', c: { $sum: 1 } } }
        ],
        byStatus: [
          { $group: { _id: '$status', c: { $sum: 1 } } }
        ],
        byError: [
          { $match: {
              $or: [
                { errorCode:  { $exists:true, $ne:null } },
                { error_code: { $exists:true, $ne:null } }
              ]
            }
          },
          { $project: { code: { $ifNull: ['$errorCode', '$error_code'] } } },
          { $group: { _id: '$code', c: { $sum: 1 } } }
        ],
        sums: [
          { $group: {
            _id: null,
            sumSegments: { $sum: { $ifNull: ['$numSegments', { $ifNull: ['$num_segments', 0] }] } },
            totalPriceRaw: { $sum: { $toDouble: { $ifNull: ['$price', 0] } } },
            totalPriceAbs: { $sum: { $abs: { $toDouble: { $ifNull: ['$price', 0] } } } }
          } }
        ],
        uniqOut: [
          { $match: { direction: 'outbound-api' } },
          { $group: { _id: null, nums: { $addToSet: '$to' } } },
          { $project: { _id: 0, count: { $size: '$nums' } } }
        ],
        // Conteo de STOP (inbound) mirando body o Body con regexMatch (case-insensitive)
        stopCount: [
          { $match: { direction: 'inbound' } },
          { $match: { $expr: { $regexMatch: { input: BODY_EXPR, regex: STOP_REGEX, options: 'i' } } } },
          { $group: { _id: null, c: { $sum: 1 } } }
        ],
        // Repeat responders (≥1 inbound que NO sea STOP), agrupando por from/From
        repeatResponders: [
          { $match: { direction: 'inbound' } },
          { $match: { $expr: { $not: { $regexMatch: { input: BODY_EXPR, regex: STOP_REGEX, options: 'i' } } } } },
          { $group: { _id: FROM_EXPR, count: { $sum: 1 } } },
          { $match: { _id: { $ne: null } } },
          { $sort: { count: -1 } },
          { $limit: 500 }
        ]
      } }
    ]).toArray();

    const f = facets[0] || {};
    const outbound = (f.dirCounts || []).find(x => x._id === 'outbound-api')?.c || 0;
    const inbound  = (f.dirCounts || []).find(x => x._id === 'inbound')?.c || 0;
    const total    = outbound + inbound;

    const byStatus = {};
    (f.byStatus || []).forEach(s => { if (s._id) byStatus[s._id] = s.c; });

    const byError = {};
    (f.byError || []).forEach(e => { if (e._id != null) byError[String(e._id)] = e.c; });

    const sums = (f.sums && f.sums[0]) || {};
    const uniqueProspectsTotal = (f.uniqOut && f.uniqOut[0]?.count) || 0;
    const stopCount = (f.stopCount && f.stopCount[0]?.c) || 0;

    
let repeatResponders = (f.repeatResponders || []).map(r => ({ phone: r._id, count: r.count }));

// --- GHL enrichment (if locationId is provided) ---
const { decryptFromBase64 } = require('../lib/crypto');
const { searchContactByPhone } = require('../lib/ghl');
const { ObjectId } = require('mongodb');

function tenantFilter(id){
  const ors = [{ tenantId: id }];
  if (/^[a-f0-9]{24}$/i.test(id)) { try { ors.push({ _id: new ObjectId(id) }); } catch {} }
  return { $or: ors };
}

const locationId = getQ(req.query, 'locationId');
if (locationId && repeatResponders.length){
  const Tenants = (await getDb()).collection('tenants');
  const tenant = await Tenants.findOne(tenantFilter(tenantId), { projection: { 'ghl.locations': 1 } });
  const cred = tenant?.ghl?.locations?.find(l => l.locationId === locationId && l.active !== false);
  if (cred){
    const apiKey = decryptFromBase64(cred.apiKey_enc);
    const uniqPhones = [...new Set(repeatResponders.map(r => r.phone).filter(Boolean))];
    // Batch lookups to avoid hammering the API
    const chunk = (arr, size) => Array.from({length: Math.ceil(arr.length/size)}, (_,i) => arr.slice(i*size,(i+1)*size));
    const batches = chunk(uniqPhones, 10);
    const byPhone = {};
    for (const b of batches){
      const results = await Promise.all(b.map(ph => searchContactByPhone({ apiKey, locationId, phone: ph }).catch(()=>null)));
      b.forEach((ph, i) => { byPhone[ph] = results[i]; });
    }
    repeatResponders = repeatResponders.map(r => {
      const c = byPhone[r.phone];
      return (c && c.id)
        ? { ...r, contactId: c.id, firstName: c.firstName || '', lastName: c.lastName || '', ghlUrl: `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(c.id)}` }
        : r;
    });
  }
}


    res.statusCode = 200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({
      ok:true,
      outbound, inbound, total,
      byStatus, byError,
      sumSegments: sums.sumSegments || 0,
      totalPriceRaw: sums.totalPriceRaw || 0,
      totalPriceAbs: sums.totalPriceAbs || 0,
      uniqueProspectsTotal, stopCount,
      repeatResponders
    }));
  }catch(e){
    console.error('metrics_error', e && e.stack || e);
    res.statusCode = e.message === 'invalid_token' ? 401 : 500;
    res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
