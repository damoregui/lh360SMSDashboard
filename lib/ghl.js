// lib/ghl.js
try { require('./loadEnv'); } catch {}
const { normalizePhoneForSearch } = require('./phone');

const BASE = process.env.LEADC_BASE_URL || 'https://services.leadconnectorhq.com';

// Logs opcionales
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
 * ÚNICO método de búsqueda: POST /contacts/search con filters [{field:"phone",operator:"eq",value:q}]
 * Devuelve: { id, firstName, lastName } o null si no hay match.
 */
async function searchContactByPhone({ apiKey, locationId, phone }){
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    Version: '2021-07-28',
  };

  const q = normalizePhoneForSearch(phone);
  const url = `${BASE}/contacts/search`;
  const body = JSON.stringify({
    locationId,
    page: 1,
    pageLimit: 20,
    filters: [{ field: 'phone', operator: 'eq', value: q }],
  });

  log('lookup:start', { locationId, phone: maskPhone(q) });

  try{
    const res = await fetch(url, { method: 'POST', headers, body });
    const data = await toJson(res);

    if (!res.ok){
      log('lookup:non_ok', { status: res.status, body: data });
      if (res.status === 401 || res.status === 403) {
        throw new Error(`ghl_auth_${res.status}`);
      }
      return null;
    }

    const items = Array.isArray(data?.contacts) ? data.contacts : [];
    log('lookup:ok', { items: items.length });

    if (!items.length) {
      log('lookup:end:not_found', { phone: maskPhone(q) });
      return null;
    }

    // Tomamos el primero (la API ya filtra eq por teléfono)
    const c = items[0];
    const out = {
      id: c.id,
      firstName: c.firstName || '',
      lastName: c.lastName || '',
    };

    if (out.id) {
      log('lookup:match', { id: out.id, firstName: out.firstName, lastName: out.lastName });
      return out;
    }

    log('lookup:end:not_found_parsed', { phone: maskPhone(q) });
    return null;
  }catch(e){
    log('lookup:error', { err: String(e?.message || e) });
    throw e;
  }
}

module.exports = { searchContactByPhone };
