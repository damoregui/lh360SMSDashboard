// api/tenants/[tenantId]/ghl/locations/index.js
try { require('../../../../lib/loadEnv'); } catch {}
const { getDb } = require('../../../../lib/db');
const { encryptToBase64, maskSecret } = require('../../../../lib/crypto');

module.exports = async (req, res) => {
  try{
    const { tenantId } = req.query;
    const db = await getDb();
    const Tenants = db.collection('tenants');

    if (req.method === 'POST'){
      const { locationId, apiKey, alias } = req.body || {};
      if (!locationId || !apiKey){
        res.statusCode = 400;
        return res.end(JSON.stringify({ ok:false, error:'locationId_and_apiKey_required' }));
      }
      const now = new Date();
      const doc = {
        locationId,
        apiKey_enc: encryptToBase64(apiKey),
        alias: alias || null,
        active: true,
        createdAt: now,
        updatedAt: now,
      };
      await Tenants.updateOne(
        { _id: tenantId },
        { $setOnInsert: { _id: tenantId, createdAt: now }, $set: { updatedAt: now }, $push: { 'ghl.locations': doc } },
        { upsert: true }
      );
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, locationId, apiKeyMasked: maskSecret(apiKey) }));
    }

    if (req.method === 'GET'){
      const tenant = await Tenants.findOne({ _id: tenantId }, { projection: { 'ghl.locations': 1 } });
      const items = (tenant?.ghl?.locations || []).map(l => ({
        locationId: l.locationId,
        alias: l.alias || null,
        active: l.active !== false,
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
        apiKeyMasked: '****'
      }));
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, items }));
    }

    res.setHeader('Allow','GET, POST');
    res.statusCode = 405;
    return res.end(JSON.stringify({ ok:false, error:'method_not_allowed' }));
  }catch(e){
    console.error('ghl_locations_index_error', e && e.stack || e);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
