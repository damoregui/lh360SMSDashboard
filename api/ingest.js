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

    let fetched = 0, upserts = 0, pages = 0;
    let batch = [];
    const BATCH_SIZE = 500;
    const now = new Date();

    function pushOp(m){
      const sent    = m.dateSent    ? new Date(m.dateSent)    : null;
      const created = m.dateCreated ? new Date(m.dateCreated) : null;
      const primaryDate = sent || created || now;

      const doc = {
        tenantId,
        sid: m.sid,
        accountSid: m.accountSid || accountSid,
        dateSentUtc: primaryDate,                  // MISMO CAMPO que antes
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

    function newestTsOf(msg){
      const ts = [];
      if (msg.dateSent) ts.push(new Date(msg.dateSent).getTime());
      if (msg.dateCreated) ts.push(new Date(msg.dateCreated).getTime());
      if (msg.dateUpdated) ts.push(new Date(msg.dateUpdated).getTime());
      return ts.length ? Math.max(...ts) : 0;
    }

    function isInRange(msg){
      const sent    = msg.dateSent    ? new Date(msg.dateSent)    : null;
      const created = msg.dateCreated ? new Date(msg.dateCreated) : null;
      return Boolean(
        (sent && sent >= start && sent < end) ||
        (!sent && created && created >= start && created < end)
      );
    }

    // ======= LÓGICA 100% COBERTURA =======
    // NO usamos filtros por dateSent en Twilio. Paginamos newest-first y cortamos por tiempo.
    let page = await withRetry(() => client.messages.page({ pageSize: 1000 }));
    let stop = false;

    while (page && !stop){
      pages++;
      for (const m of page.instances){
        const newest = newestTsOf(m);
        if (newest && newest < start.getTime()){
          stop = true; break;
        }
        if (!isInRange(m)) continue;
        fetched++;
        pushOp(m);
        if (batch.length >= BATCH_SIZE) await flush();
      }
      if (!stop){
        page = page.hasNextPage ? await withRetry(() => page.nextPage()) : null;
      }
    }

    await flush();

    res.statusCode = 200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, day, fetched, upserts, pages }));
  }catch(e){
    console.error('ingest_error', e && e.stack || e);
    const status = e.message === 'invalid_token' ? 401 : 500;
    res.statusCode = status;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
