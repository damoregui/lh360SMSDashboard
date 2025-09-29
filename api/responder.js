// api/responder.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

// Filtramos inbound con "stop" en body/Body (no distingue mayúsculas)
const STOP_REGEX = 'stop';

function rangeUtc(from, to){
  const start = new Date(from + 'T00:00:00.000Z');
  const end   = new Date(new Date(to + 'T00:00:00.000Z').getTime() + 24*60*60*1000); // exclusivo
  return { start, end };
}
function getStr(q, key){
  let v = q ? q[key] : '';
  if (Array.isArray(v)) v = v[0];
  return (typeof v === 'string') ? v.trim() : '';
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'GET'){
      res.setHeader('Allow', 'GET');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'Method Not Allowed' }));
    }
    const claims   = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    const phoneRaw = getStr(req.query, 'phone');
    const dayFrom  = getStr(req.query, 'from')  || getStr(req.query, 'fromDay');
    const dayTo    = getStr(req.query, 'to')    || getStr(req.query, 'toDay');

    if (!phoneRaw || !/^\+?[0-9()\s.\-]+$/.test(phoneRaw) ||
        !/^\d{4}-\d{2}-\d{2}$/.test(dayFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dayTo)) {
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'bad_request' }));
    }

    const { start, end } = rangeUtc(dayFrom, dayTo);
    const db  = await getDb();
    const col = db.collection('messages');

    // Variantes del número para maches exactos
    const digits = phoneRaw.replace(/\D/g, '');
    const e164   = '+' + digits;
    const noPlus = digits;
    const variants = Array.from(new Set([phoneRaw, e164, noPlus]));

    // Expresiones para usar en $expr (normalización campo/camel-case)
    const BODY_EXPR = { $ifNull: ['$body', { $ifNull: ['$Body', ''] }] };
    const FROM_EXPR = { $ifNull: ['$from', { $ifNull: ['$From', ''] }] };
    const TO_EXPR   = { $ifNull: ['$to',   { $ifNull: ['$To',   ''] }] };

    // Filtro común por rango/tenant
    const common = { tenantId, dateSentUtc: { $gte: start, $lt: end } };

    // --- INBOUND (excluyendo STOP) ---
    const inboundFilterBase = {
      ...common,
      direction: 'inbound',
      $expr: { $not: { $regexMatch: { input: BODY_EXPR, regex: STOP_REGEX, options: 'i' } } }
    };

    // 1) inbound: por igualdad contra variantes en from/From
    let inbound = await col.find({
      ...inboundFilterBase,
      $or: [ { from: { $in: variants } }, { From: { $in: variants } } ]
    }, {
      projection: { _id: 0, dateSentUtc: 1, body: 1, Body: 1, sid: 1, direction: 1 },
      sort: { dateSentUtc: 1 }
    }).limit(500).toArray();

    // 2) inbound: fallback normalizando dígitos en from/From
    if (!inbound.length){
      inbound = await col.find({
        ...inboundFilterBase,
        $expr: {
          $and: [
            inboundFilterBase.$expr, // mantiene el "no STOP"
            {
              $eq: [
                { $regexReplace: { input: FROM_EXPR, regex: /[^0-9]/g, replacement: "" } },
                digits
              ]
            }
          ]
        }
      }, {
        projection: { _id: 0, dateSentUtc: 1, body: 1, Body: 1, sid: 1, direction: 1 },
        sort: { dateSentUtc: 1 }
      }).limit(500).toArray();
    }

    // --- OUTBOUND (sin filtrar STOP) ---
    // 1) outbound: por igualdad contra variantes en to/To
    let outbound = await col.find({
      ...common,
      direction: 'outbound-api',
      $or: [ { to: { $in: variants } }, { To: { $in: variants } } ]
    }, {
      projection: { _id: 0, dateSentUtc: 1, body: 1, Body: 1, sid: 1, direction: 1 },
      sort: { dateSentUtc: 1 }
    }).limit(500).toArray();

    // 2) outbound: fallback normalizando dígitos en to/To
    if (!outbound.length){
      outbound = await col.find({
        ...common,
        direction: 'outbound-api',
        $expr: {
          $eq: [
            { $regexReplace: { input: TO_EXPR, regex: /[^0-9]/g, replacement: "" } },
            digits
          ]
        }
      }, {
        projection: { _id: 0, dateSentUtc: 1, body: 1, Body: 1, sid: 1, direction: 1 },
        sort: { dateSentUtc: 1 }
      }).limit(500).toArray();
    }

    // Normalizo body y direction
    function norm(m){
      return {
        dateSentUtc: m.dateSentUtc,
        body: (m.body ?? m.Body ?? ''),
        sid: m.sid,
        direction: (m.direction || '').toLowerCase() === 'inbound' ? 'inbound' : 'outbound' // todo lo demás = outbound
      };
    }
    const all = inbound.map(norm).concat(outbound.map(norm))
      .sort((a,b)=> new Date(a.dateSentUtc) - new Date(b.dateSentUtc))
      .slice(0, 1000); // seguridad

    res.statusCode = 200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, phone: phoneRaw, count: all.length, messages: all }));
  }catch(e){
    console.error('responder_error', e && e.stack || e);
    res.statusCode = e.message === 'invalid_token' ? 401 : 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
