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

    // Día objetivo: ?day=YYYY-MM-DD (UTC). Default: ayer UTC
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

    // Intento de opciones de reintento (silencioso si la lib no las soporta)
    const client = twilio(accountSid, authToken, { autoRetry: true, maxRetries: 3 });

    const col = db.collection('messages');
    try { await col.createIndex({ tenantId:1, sid:1 }, { unique:true }); } catch {}

    let fetched = 0, upserts = 0;
    let batch = [];
    const BATCH_SIZE = 500;
    const now = new Date();

    function pushOp(m){
      const sent    = m.dateSent    ? new Date(m.dateSent)    : null;
      const created = m.dateCreated ? new Date(m.dateCreated) : null;
      const updated = m.dateUpdated ? new Date(m.dateUpdated) : null;

      const doc = {
        tenantId,
        sid: m.sid,
        accountSid: m.accountSid || accountSid,
        // Compat: mantenemos dateSentUtc como principal (prefiere sent)
        dateSentUtc: sent || created || now,
        // Nuevos campos para trazabilidad
        dateCreatedUtc: created || now,
        dateUpdatedUtc: updated || null,

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

    // ===== PASADA 1: traer TODOS los outbound por dateSent (garantiza 100% enviados del día) =====
    async function fetchOutboundBySentRange(rangeStart, rangeEnd){
      let page = await withRetry(() =>
        client.messages.page({
          dateSentAfter:  rangeStart,
          dateSentBefore: rangeEnd,
          pageSize: 1000
        })
      );

      while (page){
        for (const m of page.instances){
          if (!m.direction || !/^outbound/i.test(m.direction)) continue;
          pushOp(m);
          fetched++;
          if (batch.length >= BATCH_SIZE) await flush();
        }
        page = page.hasNextPage ? await withRetry(() => page.nextPage()) : null;
      }
    }

    await fetchOutboundBySentRange(start, end);

    // ===== PASADA 2 (fallback inbound/otros sin sent): recorrer desde lo más nuevo y cortar por ventana =====
    let page = await withRetry(() => client.messages.page({ pageSize: 1000 }));
    let stop = false;

    while (page && !stop){
      for (const m of page.instances){
        const sent     = m.dateSent    ? new Date(m.dateSent)    : null;
        const created  = m.dateCreated ? new Date(m.dateCreated) : null;
        const updated  = m.dateUpdated ? new Date(m.dateUpdated) : null;

        // Usamos el timestamp MÁS RECIENTE para decidir corte de paginación
        const candidates = [];
        if (sent)    candidates.push(sent.getTime());
        if (created) candidates.push(created.getTime());
        if (updated) candidates.push(updated.getTime());
        const newestTs = candidates.length ? Math.max(...candidates) : 0;

        if (newestTs && newestTs < start.getTime()){
          stop = true; break;
        }

        // Evitar reprocesar outbound (ya entraron por la pasada 1)
        if (m.direction && /^outbound/i.test(m.direction)) continue;

        // Para inbound y mensajes sin sent, usamos ventana por CREATED (y de backup por SENT)
        const inRange =
          (created && created >= start && created < end) ||
          (sent && sent >= start && sent < end);

        if (!inRange) continue;

        pushOp(m);
        fetched++;
        if (batch.length >= BATCH_SIZE) await flush();
      }

      if (!stop){
        page = page.hasNextPage ? await withRetry(() => page.nextPage()) : null;
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
