// api/responder.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

const STOP_RE = /\bstop\b/i;

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

    // 1) Exact matches (excluye STOP)
    let items = await col.find({
      tenantId,
      direction: 'inbound',
      from: { $in: variants },
      body: { $not: /\\bstop\\b/i },
      dateSentUtc: { $gte: start, $lt: end }
    }, {
      projection: { _id: 0, dateSentUtc: 1, body: 1, sid: 1 },
      sort: { dateSentUtc: 1 }
    }).limit(400).toArray();

    // 2) Fallback normalizando dígitos (excluye STOP)
    if (!items.length) {
      items = await col.find({
        tenantId,
        direction: 'inbound',
        body: { $not: /\\bstop\\b/i },
        dateSentUtc: { $gte: start, $lt: end },
        $expr: {
          $eq: [
            { $regexReplace: { input: "$from", regex: /[^0-9]/g, replacement: "" } },
            digits
          ]
        }
      }, {
        projection: { _id: 0, dateSentUtc: 1, body: 1, sid: 1 },
        sort: { dateSentUtc: 1 }
      }).limit(400).toArray();
    }

    // Safety filter por si algún motor ignora el regex anterior
    items = items.filter(m => !STOP_RE.test(m.body || ''));

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, phone: phoneRaw, count: items.length, messages: items }));
  }catch(e){
    console.error('responder_error', e && e.stack || e);
    res.statusCode = e.message === 'invalid_token' ? 401 : 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
