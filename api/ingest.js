// api/ingest.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const twilio = require('twilio');

function parseDayParam(q){
  const day = (q.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}
function toUtcRange(dayStr){
  const start = new Date(dayStr + 'T00:00:00.000Z');
  const end = new Date(start.getTime() + 24*60*60*1000);
  return { start, end };
}

module.exports = async (req, res) => {
  if (req.method !== 'POST'){
    res.setHeader('Allow','POST');
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok:false, error:'Method Not Allowed' }));
  }

  try{
    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    let day = parseDayParam(req.query || {});
    if (!day){
      const y = new Date(Date.now() - 86400000);
      const yyyy = y.getUTCFullYear();
      const mm = String(y.getUTCMonth()+1).padStart(2,'0');
      const dd = String(y.getUTCDate()).padStart(2,'0');
      day = `${yyyy}-${mm}-${dd}`;
    }
    const { start, end } = toUtcRange(day);

    const db = await getDb();
    const tenant = await db.collection('tenants').findOne({ tenantId, status:'active' });
    if (!tenant || !tenant.twilio || !tenant.twilio.accountSid || !tenant.twilio.authToken){
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'twilio_credentials_missing' }));
    }

    const accountSid = String(tenant.twilio.accountSid).trim();
    const authToken  = String(tenant.twilio.authToken).trim();
    const client = twilio(accountSid, authToken);

    const col = db.collection('messages');
    try { await col.createIndex({ tenantId:1, sid:1 }, { unique:true }); } catch {}

    let fetched = 0, upserts = 0;
    let batch = [];
    const BATCH_SIZE = 500;
    const now = new Date();

    function pushOp(m){
      const sent    = m.dateSent    ? new Date(m.dateSent)    : null;
      const created = m.dateCreated ? new Date(m.dateCreated) : null;

      // Persistimos la fecha "principal" como sent si existe, sino created
      const primaryDate = sent || created || now;

      const doc = {
        tenantId,
        sid: m.sid,
        accountSid: m.accountSid || accountSid,
        dateSentUtc: primaryDate,
        from: m.from,
        to: m.to,
        direction: m.direction,
        status: m.status,
        numSegments: Number(m.numSegments || 0),
        price: m.price != null ? Number(m.price) : null,
        priceUnit: m.priceUnit || null,
        errorCode: m.errorCode != null ? String(m.errorCode) : null,
        errorMessage: m.errorMessage || null,
        messagingServiceSid: m.messagingServiceSid || null,
        body: m.body || null,
        updatedAt: now
      };

      batch.push({
        updateOne: {
          filter: { tenantId, sid: m.sid },
          update: { $set: doc, $setOnInsert: { createdAt: now } },
          upsert: true
        }
      });
    }

    async function flush(){
      if (!batch.length) return;
      const ops = batch; batch = [];
      try{
        const r = await col.bulkWrite(ops, { ordered:false });
        upserts += (r.upsertedCount || 0) + (r.modifiedCount || 0);
      }catch(e){
        console.error('bulkWrite_error', e.message);
      }
    }

    async function withRetry(fn, retries = 4){
      let attempt = 0;
      while (true){
        try { return await fn(); }
        catch (e){
          attempt++;
          if (attempt > retries) throw e;
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt - 1)));
        }
      }
    }

    // Recorremos sin filtros de fecha y cortamos cuando lo que queda es anterior al día
    let page = await withRetry(() => client.messages.page({ pageSize: 1000 }));
    let stop = false;

    while (page && !stop){
      for (const m of page.instances){
        const sent     = m.dateSent    ? new Date(m.dateSent)    : null;
        const created  = m.dateCreated ? new Date(m.dateCreated) : null;
        const updated  = m.dateUpdated ? new Date(m.dateUpdated) : null;

        // Decidir si cortar: usamos el timestamp MÁS RECIENTE disponible
        const candidates = [];
        if (sent)    candidates.push(sent.getTime());
        if (created) candidates.push(created.getTime());
        if (updated) candidates.push(updated.getTime());
        const newestTs = candidates.length ? Math.max(...candidates) : 0;

        if (newestTs && newestTs < start.getTime()){
          // A partir de acá todo debería ser más viejo, cortamos paginación
          stop = true;
          break;
        }

        // Pertenencia al día: priorizamos SENT; si no hay SENT, usamos CREATED
        const inRange =
          (sent    && sent    >= start && sent    < end) ||
          (!sent && created && created >= start && created < end);

        if (inRange){
          fetched++;
          pushOp(m);
          if (batch.length >= BATCH_SIZE) await flush();
        }
      }

      if (!stop){
        if (page.hasNextPage){
          page = await withRetry(() => page.nextPage());
        } else {
          page = null;
        }
      }
    }

    await flush();

    res.statusCode = 200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, day, fetched, upserts }));
  }catch(e){
    console.error('ingest_error', e && e.stack || e);
    const status = e.message === 'invalid_token' ? 401 : 500;
    res.statusCode = status;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
