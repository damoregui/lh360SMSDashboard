// lib/ghl.js
try { require('./loadEnv'); } catch {}
const { normalizePhoneForSearch } = require('./phone');

const BASE = process.env.LEADC_BASE_URL || 'https://services.leadconnectorhq.com';

async function toJson(res){
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt }; }
}

async function searchContactByPhone({ apiKey, locationId, phone }){
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };
  const q = normalizePhoneForSearch(phone);

  const attempts = [
    { method: 'GET', url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}&phone=${encodeURIComponent(q)}` },
    { method: 'POST', url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}`, body: JSON.stringify({ phone: q }) },
    { method: 'GET', url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(q)}` },
  ];

  for (const a of attempts){
    try{
      const res = await fetch(a.url, { method: a.method, headers, body: a.body });
      if (!res.ok){
        if (res.status === 401 || res.status === 403){
          const err = await toJson(res);
          throw new Error(`ghl_auth_${res.status}:${JSON.stringify(err)}`);
        }
        continue;
      }
      const data = await toJson(res);
      const items = Array.isArray(data?.contacts) ? data.contacts : (Array.isArray(data) ? data : (data?.data || []));
      if (items && items.length){
        const exact = items.find(c => [c.phone, c.phoneNumber, c?.contact?.phone].some(v => v && String(v).includes(q)));
        const c = exact || items[0];
        return {
          id: c.id || c.contact?.id,
          firstName: c.firstName || c.contact?.firstName || '',
          lastName: c.lastName || c.contact?.lastName || '',
        };
      }
    }catch(e){
      if (String(e && e.message || '').startsWith('ghl_auth_')) throw e;
    }
  }
  return null;
}

module.exports = { searchContactByPhone };
