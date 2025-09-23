// api/login.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const bcrypt = require('bcryptjs');
const { signToken } = require('../lib/auth');
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
  try{
    const body = await readJson(req);
    const username = (body.username||'').trim();
    const password = String(body.password||'');
    if (!username || !password){ res.statusCode=400; return res.end(JSON.stringify({ok:false,error:'missing_credentials'})); }
    const db = await getDb();
    const user = await db.collection('users').findOne({ username });
    if (!user){ res.statusCode=401; return res.end(JSON.stringify({ok:false,error:'invalid_credentials'})); }
    const match = await bcrypt.compare(password, user.passwordHash||'');
    if (!match){ res.statusCode=401; return res.end(JSON.stringify({ok:false,error:'invalid_credentials'})); }
    const token = signToken({ tenantId: user.tenantId, username: user.username, role: user.role });
    await db.collection('users').updateOne({ _id: user._id }, { $set: { lastLoginAt: new Date() } });
    res.statusCode=200; res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, token }));
  }catch(e){ console.error('login_error', e&&e.stack||e); res.statusCode=500; return res.end(JSON.stringify({ok:false,error:'server_error'})); }
};
