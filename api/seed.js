// api/seed.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const bcrypt = require('bcryptjs');
const { randomUUID } = require('crypto');
async function readJson(req){
  if (req.body){
    if (typeof req.body === 'string') return JSON.parse(req.body);
    if (typeof req.body === 'object') return req.body;
  }
  const chunks = []; for await (const c of req) chunks.push(Buffer.isBuffer(c)? c : Buffer.from(c));
  const raw = Buffer.concat(chunks).toString('utf8') || '';
  return JSON.parse(raw || '{}');
}

module.exports = async (req, res) => {
  if (req.method !== 'POST'){ res.setHeader('Allow','POST'); res.statusCode=405; return res.end(JSON.stringify({ok:false,error:'Method Not Allowed'})); }
  const provided = String(req.headers['x-seed-token']||'').trim();
  const expected = String(process.env.ADMIN_SEED_TOKEN||'').trim();
  if (!provided || !expected || provided !== expected){ res.statusCode=401; return res.end(JSON.stringify({ok:false,error:'unauthorized'})); }
  try{
    const body = await readJson(req);
    const { tenantName, username, password, twilioAccountSid, twilioAuthToken } = body||{};
    const allOk = [tenantName, username, password, twilioAccountSid, twilioAuthToken].every(v => typeof v==='string' && v.trim()!=='');
    if (!allOk){ res.statusCode=400; return res.end(JSON.stringify({ok:false,error:'missing_fields'})); }
    const db = await getDb();
    const now = new Date();
    const tenantId = randomUUID();
    await db.collection('tenants').insertOne({
      tenantId, name: tenantName, status:'active',
      twilio: { accountSid: twilioAccountSid.trim(), authToken: twilioAuthToken.trim() },
      createdAt: now, updatedAt: now
    });
    const passwordHash = await bcrypt.hash(password, 10);
    await db.collection('users').insertOne({
      tenantId, username, passwordHash, role:'owner', createdAt: now, updatedAt: now
    });
    res.statusCode=200; return res.end(JSON.stringify({ok:true, tenantId}));
  }catch(e){ console.error('seed_error', e&&e.stack||e); res.statusCode=500; return res.end(JSON.stringify({ok:false,error:e.message||'server_error'})); }
};
