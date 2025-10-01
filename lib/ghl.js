// lib/ghl.js
try { require('./loadEnv'); } catch {}
const { normalizePhoneForSearch } = require('./phone');

const BASE = process.env.LEADC_BASE_URL || 'https://services.leadconnectorhq.com';
const DEBUG_GHL = String(process.env.DEBUG_GHL || '').toLowerCase() === '1'
  || String(process.env.DEBUG_GHL || '').toLowerCase() === 'true';
const log = (...args) => { if (DEBUG_GHL) console.log('[ghl]', ...args); };

function maskPhone(p){
  if (!p) return '';
  const s = String(p).replace(/[^\d+]/g, '');
  const last4 = s.slice(-4);
  const lead  = s.startsWith('+') ? '+' : '';
  return `${lead}***${last4}`;
}

async function toJson(res){
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { return { _raw: txt }; }
}

/**
 * Busca un contacto por teléfono en GHL con varias estrategias.
 * Devuelve: { id, firstName, lastName } o null si no hay match.
 */
async function searchContactByPhone({ apiKey, locationId, phone }){
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const q = normalizePhoneForSearch(phone);
  log('lookup:start', { locationId, phone: maskPhone(q) });

  const attempts = [
    // 1) parámetros directos
    { name:'GET_phone', method:'GET',
      url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}&phone=${encodeURIComponent(q)}` },

    { name:'POST_phone', method:'POST',
      url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}`,
      body: JSON.stringify({ phone: q }) },

    { name:'GET_query', method:'GET',
      url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}&query=${encodeURIComponent(q)}` },

    // 2) filtros explícitos por campo (según tu captura)
    // variante A: arreglo "filters"
    { name:'POST_filters_eq', method:'POST',
      url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}`,
      body: JSON.stringify({
        page: 1, limit: 5,
        filters: [{ field: 'phone', operator: 'eq', value: q }]
      }) },

    // variante B: objeto "filter" (algunos tenants viejos lo aceptan)
    { name:'POST_filter_eq', method:'POST',
      url: `${BASE}/contacts/search?locationId=${encodeURIComponent(locationId)}`,
      body: JSON.stringify({
        page: 1, limit: 5,
        filter: { field: 'phone', operator: 'eq', value: q }
      }) },
  ];

  for (let i = 0; i < attempts.length; i++){
    const a = attempts[i];
    try{
      log('attempt', { i: i+1, name: a.name, method: a.method });

      const res = await fetch(a.url, { method: a.method, headers, body: a.body });
      if (!res.ok){
        const body = await toJson(res);
        log('attempt:non_ok', { i: i+1, status: res.status, body });
        if (res.status === 401 || res.status === 403) throw new Error(`ghl_auth_${res.status}`);
        continue;
      }

      const data = await toJson(res);
      const items = Array.isArray(data?.contacts) ? data.contacts
                  : (Array.isArray(data) ? data
                  : (Array.isArray(data?.data) ? data.data : []));
      log('attempt:ok', { i: i+1, items: items.length });

      if (items.length){
        // tratar de matchear por teléfono exacto/contiene
        const exact = items.find(c =>
          [c.phone, c.phoneNumber, c?.contact?.phone].some(v => v && String(v).includes(q))
        );
        const c = exact || items[0];

        const out = {
          id: c.id || c.contact?.id,
          firstName: c.firstName || c.contact?.firstName || '',
          lastName: c.lastName || c.contact?.lastName || '',
        };
        if (out.id){
          log('lookup:match', { id: out.id, firstName: out.firstName, lastName: out.lastName });
          return out;
        }
      }
    }catch(e){
      log('attempt:error', { i: i+1, name: a.name, err: String(e?.message || e) });
      if (String(e?.message || '').startsWith('ghl_auth_')) throw e;
    }
  }

  log('lookup:end:not_found', { phone: maskPhone(q) });
  return null;
}

module.exports = { searchContactByPhone };
