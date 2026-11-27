// Supabase (database and login) for the B2B part. Only the server talks to the database,
// with the secret key from Vercel; the browser only ever logs in and gets a session.
//
// Vercel variables:
//   SUPABASE_URL               https://<ref>.supabase.co
//   SUPABASE_PUBLISHABLE_KEY   public key, used for login calls
//   SUPABASE_SECRET_KEY        secret key (sb_secret_… or the legacy service_role key). Never in the browser.

const URL = () => (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SECRET = () => process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const PUBLIC = () => process.env.SUPABASE_PUBLISHABLE_KEY || '';

function enabled() { return !!(URL() && SECRET()); }

// New-style keys (sb_…) go in the apikey header only; legacy JWT keys also as a bearer token.
function adminHeaders(extra) {
  const k = SECRET();
  const h = { apikey: k, 'Content-Type': 'application/json' };
  if (!k.startsWith('sb_')) h.Authorization = `Bearer ${k}`;
  return Object.assign(h, extra || {});
}

async function call(path, opts) {
  const r = await fetch(URL() + path, opts);
  const text = await r.text();
  let data = null; try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!r.ok) {
    const err = new Error(`supabase ${opts.method || 'GET'} ${path.split('?')[0]} ${r.status}: ${String(text).slice(0, 200)}`);
    err.status = r.status; err.data = data;
    throw err;
  }
  return data;
}

// PostgREST: db.rest('b2b_orders?select=*&id=eq.4'), db.rest('b2b_orders', { method: 'POST', body: {...} })
function rest(path, o) {
  o = o || {};
  const headers = adminHeaders(o.prefer ? { Prefer: o.prefer } : (o.method && o.method !== 'GET' ? { Prefer: 'return=representation' } : {}));
  return call('/rest/v1/' + path, { method: o.method || 'GET', headers, body: o.body ? JSON.stringify(o.body) : undefined });
}
const rpc = (fn, args) => call('/rest/v1/rpc/' + fn, { method: 'POST', headers: adminHeaders(), body: JSON.stringify(args || {}) });

// Auth admin
const createUser = (email, meta) => call('/auth/v1/admin/users', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ email, email_confirm: true, user_metadata: meta || {} }) });
const updateUser = (id, body) => call('/auth/v1/admin/users/' + id, { method: 'PUT', headers: adminHeaders(), body: JSON.stringify(body) });

// A one-time link token for setting a password (new account or forgotten password).
// We send the mail ourselves, so the link points to our own page, not Supabase's.
async function passwordToken(email) {
  const d = await call('/auth/v1/admin/generate_link', { method: 'POST', headers: adminHeaders(), body: JSON.stringify({ type: 'recovery', email }) });
  const props = (d && d.properties) || d || {};
  if (!props.hashed_token) throw new Error('no token in generate_link response');
  return props.hashed_token;
}

// The logged-in user behind a browser session token, or null.
async function userFromToken(token) {
  if (!token || token.length > 4000) return null;
  try {
    const r = await fetch(URL() + '/auth/v1/user', { headers: { apikey: PUBLIC() || SECRET(), Authorization: `Bearer ${token}` } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? u : null;
  } catch (e) { return null; }
}

const q = (v) => encodeURIComponent(String(v));

module.exports = { enabled, rest, rpc, createUser, updateUser, passwordToken, userFromToken, q, URL, PUBLIC };
