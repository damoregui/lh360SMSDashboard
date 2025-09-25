// api/ingest.js (patched to mirror TEST_CSV_Q_OF_SMS retrieval semantics)
try { require('../lib/loadEnv'); } catch {}
const { getDb }    = require('../lib/db');
const { verifyToken } = require('../lib/auth');
const https = require('https');

function parseDayParam(q){
  const day = (q.day || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return day;
}
function toUtcRange(dayStr){
  const start = new Date(dayStr + 'T00:00:00.000Z');
  const end   = new Date(start.getTime() + 24*60*60*1000);
  return { start, end };
}
function newestTimestampOf(m){
  const ts = [];
  // Twilio REST returns snake_case keys
  if (m.date_sent)   ts.push(new Date(m.date_sent).getTime());
  if (m.date_created)ts.push(new Date(m.date_created).getTime());
  if (m.date_updated)ts.push(new Date(m.date_updated).getTime());
  return ts.length ? Math.max(...ts) : 0;
}
function isInRange(m, start, end){
  const sent    = m.date_sent    ? new Date(m.date_sent)    : null;
  const created = m.date_created ? new Date(m.date_created) : null;
  return Boolean(
    (sent && sent >= start && sent < end) ||
    (!sent && created && created >= start && created < end)
  );
}

// Minimal HTTPS client with Basic Auth + retry
function basicAuthHeader(user, pass){
  return 'Basic ' + Buffer.from(`${user}:${pass}`).toString('base64');
}
function httpGet(url, headers){
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers }, (res) => {
      let data='';
      res.on('data', ch => data += ch);
      res.on('end', () => {
        if (res.statusCode !== 200){
          const err = new Error(`HTTP ${res.statusCode}`);
          err.status = res.statusCode;
          err.body = data;
          return reject(err);
        }
        try { resolve(JSON.parse(data)); }
        catch(e){ reject(e); }
      });
    });
    req.on('error', reject);
  });
}
async function withRetry(fn, retries=5){
  let attempt=0;
  while (true){
    try { return await fn(); }
    catch(e){
      attempt++;
      if (attempt > retries) throw e;
      const backoff = Math.min(1000 * Math.pow(2, attempt-1), 8000);
      await new Promise(r => setTimeout(r, backoff));
    }
  }
}

module.exports = async (req, res) => {
  try{
    if (req.method !== 'POST'){
      res.setHeader('Allow','POST');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'Method Not Allowed' }));
    }

    const claims = verifyToken(req.headers['authorization']);
    const tenantId = claims.tenantId;

    let day = parseDayParam(req.query || {});
    if (!day){
      const y = new Date(Date.now() - 86400000);
      const yyyy = y.getUTCFullYear();
      const mm   = String(y.getUTCMonth()+1).padStart(2,'0');
      const dd   = String(y.getUTCDate()).padStart(2,'0');
      day = `${yyyy}-${mm}-${dd}`;
    }
    const { start, end } = toUtcRange(day);

    const db = await getDb();
    const tenant = await db.collection('tenants').findOne({ tenantId });
    if (!tenant){
      res.statusCode=400;
      return res.end(JSON.stringify({ ok:false, error:'tenant_not_found' }));
    }
    if (!tenant.twilio || !tenant.twilio.accountSid || !tenant.twilio.authToken){
      res.statusCode=400;
      return res.end(JSON.stringify({ ok:false, error:'twilio_credentials_missing' }));
    }
    const accountSid = String(tenant.twilio.accountSid).trim();
    const authToken  = String(tenant.twilio.authToken).trim();

    const col = db.collection('messages');
    try { await col.createIndex({ tenantId:1, sid:1 }, { unique:true }); } catch {}

    let fetched=0, upserts=0, pages=0;
    const now = new Date();
    const opsBatch = [];
    const BATCH_SIZE = 500;

    function pushOp(m){
      // m is snake_case from REST
      const sent    = m.date_sent    ? new Date(m.date_sent)    : null;
      const created = m.date_created ? new Date(m.date_created) : null;
      const primary = sent || created || now;

      const doc = {
        tenantId,
        sid: m.sid,
        accountSid: m.account_sid || accountSid,
        dateSentUtc: primary,
        // keep raw important fields
        from: m.from,
        to: m.to,
        direction: m.direction,
        status: m.status,
        errorCode: m.error_code != null ? Number(m.error_code) : null,
        numSegments: m.num_segments != null ? Number(m.num_segments) : null,
        price: m.price != null ? Number(m.price) : null,
        priceUnit: m.price_unit || null,
        messagingServiceSid: m.messaging_service_sid || null,
        body: m.body || null,
        updatedAt: now
      };
      opsBatch.push({
        updateOne: {
          filter: { tenantId, sid: m.sid },
          update: { $set: doc, $setOnInsert: { createdAt: now } },
          upsert: true
        }
      });
    }
    async function flush(){
      if (!opsBatch.length) return;
      const ops = opsBatch.splice(0, opsBatch.length);
      const r = await col.bulkWrite(ops, { ordered:false });
      upserts += (r.upsertedCount || 0) + (r.modifiedCount || 0) + (r.matchedCount || 0);
    }

    const baseUrl = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
    const headers = { 'Authorization': basicAuthHeader(accountSid, authToken) };

    let nextPageUrl = `${baseUrl}?PageSize=1000`;
    let stop = false;

    while (nextPageUrl && !stop){
      pages++;
      const payload = await withRetry(() => httpGet(nextPageUrl, headers));
      const messages = Array.isArray(payload.messages) ? payload.messages : [];

      for (const m of messages){
        const newestTs = newestTimestampOf(m);
        if (newestTs && newestTs < start.getTime()){
          nextPageUrl = null; stop = true; break;
        }
        if (!isInRange(m, start, end)) continue;
        fetched++;
        pushOp(m);
        if (opsBatch.length >= BATCH_SIZE) await flush();
      }

      if (!stop){
        if (payload.next_page_uri){
          nextPageUrl = `https://api.twilio.com${payload.next_page_uri}`;
        } else {
          nextPageUrl = null;
        }
      }
    }

    await flush();

    res.statusCode=200;
    res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, day, fetched, upserts, pages }));
  }catch(e){
    console.error('ingest_error', e && e.stack || e);
    const status = e.message === 'invalid_token' ? 401 : 500;
    res.statusCode = status;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
