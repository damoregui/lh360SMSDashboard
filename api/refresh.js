// api/refresh.js
try { require('../lib/loadEnv'); } catch {}
const { signToken, verifyToken } = require('../lib/auth');
module.exports = async (req, res) => {
  if (req.method !== 'POST'){ res.setHeader('Allow','POST'); res.statusCode=405; return res.end(JSON.stringify({ok:false,error:'Method Not Allowed'})); }
  try{
    const claims = verifyToken(req.headers['authorization']);
    const token = signToken({ tenantId: claims.tenantId, username: claims.username, role: claims.role });
    res.statusCode=200; res.setHeader('Content-Type','application/json; charset=utf-8');
    return res.end(JSON.stringify({ ok:true, token }));
  }catch(e){ res.statusCode=401; return res.end(JSON.stringify({ ok:false, error:'invalid_token' })); }
};
