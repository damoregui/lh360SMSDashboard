// api/ghl-contact-lookup.js
try { require('../lib/loadEnv'); } catch {}
const { getDb } = require('../lib/db');
const { decryptFromBase64 } = require('../lib/crypto');
const { searchContactByPhone } = require('../lib/ghl');

module.exports = async (req, res) => {
  try{
    if (req.method !== 'GET'){
      res.setHeader('Allow','GET');
      res.statusCode = 405;
      return res.end(JSON.stringify({ ok:false, error:'method_not_allowed' }));
    }
    const tenantId  = (req.query.tenantId || '').toString();
    const locationId= (req.query.locationId || '').toString();
    const phone     = (req.query.phone || '').toString();
    if (!tenantId || !locationId || !phone){
      res.statusCode = 400;
      return res.end(JSON.stringify({ ok:false, error:'tenantId_locationId_phone_required' }));
    }
    const db = await getDb();
    const Tenants = db.collection('tenants');
    const tenant = await Tenants.findOne({ _id: tenantId }, { projection: { 'ghl.locations': 1 } });
    const cred = (tenant?.ghl?.locations || []).find(l => l.locationId === locationId && l.active !== false);
    if (!cred){
      res.statusCode = 404;
      return res.end(JSON.stringify({ ok:false, error:'credential_not_found' }));
    }
    const apiKey = decryptFromBase64(cred.apiKey_enc);
    const contact = await searchContactByPhone({ apiKey, locationId, phone });
    if (!contact){
      res.statusCode = 200;
      return res.end(JSON.stringify({ ok:true, found:false }));
    }
    const url = `https://app.gohighlevel.com/v2/location/${encodeURIComponent(locationId)}/contacts/detail/${encodeURIComponent(contact.id)}`;
    res.statusCode = 200;
    return res.end(JSON.stringify({ ok:true, found:true, ...contact, url }));
  }catch(e){
    console.error('ghl_lookup_error', e && e.stack || e);
    res.statusCode = 500;
    return res.end(JSON.stringify({ ok:false, error: e.message || 'server_error' }));
  }
};
