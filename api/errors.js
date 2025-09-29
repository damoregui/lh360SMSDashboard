// api/errors.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');

const KNOWN_DESC = {
  "30001":"Queue overflow",
  "30002":"Account suspended",
  "30003":"Unreachable destination handset",
  "30004":"Message blocked",
  "30005":"Unknown destination handset",
  "30006":"Landline or unreachable carrier",
  "30007":"Carrier violation (message filtered)",
  "30008":"Unknown error",
  "21610":"Message blocked: customer replied STOP",
  "21612":"To number not verified (trial)",
  "21614":"Invalid To phone number"
};

function parseDay(s){
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  return new Date(s + 'T00:00:00.000Z');
}
function rangeUtc(from, to){
  const start = parseDay(from);
  const end   = parseDay(to);
  if (!start || !end) return null;
  // end is exclusive: add 1 day
  return { start, end: new Date(end.getTime() + 24*60*60*1000) };
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'GET'){
      res.setHeader('Allow','GET');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'method_not_allowed' }));
    }

    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    const from = Array.isArray(req.query.from) ? req.query.from[0] : req.query.from;
    const to   = Array.isArray(req.query.to)   ? req.query.to[0]   : req.query.to;
    const rng = rangeUtc(from, to);
    if (!rng){
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'bad_date' }));
    }

    const db = await getDb();
    const col = db.collection('messages');

    // Agregamos por error code, tomando descripción del mismo mensaje si existe.
    const pipeline = [
      { $match: {
          tenantId,
          dateSentUtc: { $gte: rng.start, $lt: rng.end },
          $or: [
            { errorCode:   { $exists:true, $ne:null } },
            { error_code:  { $exists:true, $ne:null } }
          ]
        }
      },
      { $project: {
          code: { $ifNull: ['$errorCode', '$error_code'] },
          description: { $ifNull: ['$errorMessage', '$error_message'] }
        }
      },
      { $match: { code: { $ne: null } } },
      { $group: {
          _id: '$code',
          count: { $sum: 1 },
          // tomamos la primera descripción no vacía
          description: { $first: '$description' }
        }
      },
      { $sort: { count: -1 } }
    ];

    const raw = await col.aggregate(pipeline).toArray();

    const items = raw.map(r => {
      const code = String(r._id);
      let desc = (r.description && String(r.description).trim()) || KNOWN_DESC[code] || 'See Twilio docs';
      return { code, count: r.count || 0, description: desc };
    });

    res.statusCode = 200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.end(JSON.stringify({ ok:true, items }));
  }catch(e){
    console.error('errors_api', e && e.stack || e);
    res.statusCode = e.message === 'invalid_token' ? 401 : 500;
    res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
