// api/responder.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

// Ocultamos cualquier inbound que contenga "stop" en el body/Body
const STOP_REGEX = 'stop';

function rangeUtc(from, to){
  const start = new Date(from + 'T00:00:00.000Z');
  const end   = new Date(new Date(to + 'T00:00:00.000Z').getTime() + 24*60*60*1000);
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
    const claims = verifyToken(req.headers['authorization']);
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

    const digits = phoneRaw.replace(/\D/g, '');
    const e164   = '+' + digits;
    const noPlus = digits;
    const variants = Array.from(new Set([phoneRaw, e164, noPlus]));

    // Expresiones para $expr
    const BODY_EXPR = { $ifNull: ['$body', { $ifNull: ['$Body', ''] }] };
    const FROM_EXPR = { $ifNull: ['$from', { $ifNull: ['$From', ''] }] };

    // Filtro común: inbound no-STOP en rango
    const baseFilter = {
      tenantId,
      direction: 'inbound',
      dateSentUtc: { $gte: start, $lt: end },
      $expr: { $not: { $regexMatch: { input: BODY_EXPR, regex: STOP_REGEX, options: 'i' } } }
    };

    // 1) Intento rápido: igualdad por from/From contra cualquiera de las variantes
    let items = await col.find({
      ...baseFilter,
      $or: [
        { from: { $in: variants } },
        { From: { $in: variants } }
      ]
    }, {
      projection: { _id: 0, dateSentUtc: 1, body: 1, Body: 1, sid: 1 },
      sort: { dateSentUtc: 1 }
    }).limit(400).toArray();

    // 2) Fallback: comparo por dígitos normalizados en from/From
    if (!items.length) {
      items = await col.find({
        ...baseFilter,
        $expr: {
          $and: [
            baseFilter.$expr, // mantiene el no-STOP
            {
              $eq: [
                { $regexReplace: { input: FROM_EXPR, regex: /[^0-9]/g, replacement: "" } },
                digits
              ]
            }
          ]
        }
      }, {
        projection: { _id: 0, dateSentUtc: 1, body: 1, Body: 1, sid: 1 },
        sort: { dateSentUtc: 1 }
      }).limit(400).toArray();
    }

    // Normalizo body: si Body existe y body no, uso Body
    items = items.map(m => ({ ...m, body: (m.body ?? m.Body ?? '') }));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, phone: phoneRaw, count: items.length, messages: items }));
  }catch(e){
    console.error('responder_error', e && e.stack || e);
    res.statusCode = e.message === 'invalid_token' ? 401 : 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
