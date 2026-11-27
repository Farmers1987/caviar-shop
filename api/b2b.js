// B2B customer API (restaurants, hotels, shops). One function, several actions:
//   GET  ?action=config    public: the login settings the pages need (no secrets)
//   POST ?action=apply     public: apply for a business account
//   POST ?action=forgot    public: mail a link to choose a new password
//   GET  ?action=catalog   logged in: trade prices excl. VAT and stock status
//   POST ?action=order     logged in: place an order (pay by invoice)
//   GET  ?action=orders    logged in: my orders, deliveries and tracking links
//
// Prices, stock and totals are always worked out here, never trusted from the browser.

const db = require('./_db.js');
const stock = require('./_stock.js');
const guard = require('./_guard.js');
const DPD = require('./_dpd.js');
const mail = require('./_mail.js');
const B2BM = require('./_b2bmail.js');
const { placeOrder, availabilityView } = require('./_b2border.js');
const { B2B_CATALOG, CAVIARS, B2B_SIZES, VAT_RATE, B2B_MIN_CENTS } = require('./_shared.js');

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) && e.length <= 200;

function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}

async function customerFor(req) {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7) : '';
  const user = await db.userFromToken(token);
  if (!user) return null;
  const rows = await db.rest(`b2b_customers?select=*&id=eq.${db.q(user.id)}&active=eq.true`);
  return rows && rows[0] ? rows[0] : null;
}

// ---- actions ---------------------------------------------------------------------------

async function apply(req, res) {
  const b = body(req);
  if (b.website) return res.status(200).json({ ok: true }); // bots fill the hidden field
  const a = {
    company: str(b.company, 120), company_code: str(b.company_code, 30), vat_code: str(b.vat_code, 30) || null,
    contact_name: str(b.contact_name, 100), email: str(b.email, 200).toLowerCase(), phone: str(b.phone, 40) || null,
    address: str(b.address, 300) || null, message: str(b.message, 1000) || null, lang: b.lang === 'lt' ? 'lt' : 'en',
  };
  if (!a.company || !a.company_code || !a.contact_name || !emailOk(a.email)) return res.status(400).json({ error: 'missing' });
  if (await guard.over(req, 'b2b-apply', { limit: 3, windowSec: 3600 })) return res.status(429).json({ error: 'too_many' });
  const rows = await db.rest('b2b_applications', { method: 'POST', body: a });
  const m = B2BM.applicationMails(a);
  const id = rows && rows[0] ? rows[0].id : Date.now();
  await Promise.all([
    mail.send(`b2b-app-${id}-internal`, m.internal).catch((e) => console.error('app mail internal', e.message)),
    mail.send(`b2b-app-${id}-ack`, Object.assign({ to: [a.email] }, m.ack)).catch((e) => console.error('app mail ack', e.message)),
  ]);
  return res.status(200).json({ ok: true });
}

async function forgot(req, res) {
  const b = body(req);
  const email = str(b.email, 200).toLowerCase();
  // Same answer whether or not the address has an account, so nobody can probe for customers.
  if (!emailOk(email)) return res.status(200).json({ ok: true });
  if (await guard.over(req, 'b2b-forgot', { limit: 5, windowSec: 3600 })) return res.status(429).json({ error: 'too_many' });
  try {
    const rows = await db.rest(`b2b_customers?select=*&email=eq.${db.q(email)}&active=eq.true`);
    const c = rows && rows[0];
    if (c) {
      const token = await db.passwordToken(c.email);
      const link = `${mail.SITE}/b2b/password.html?t=${encodeURIComponent(token)}${c.lang === 'lt' ? '&lang=lt' : ''}`;
      await mail.send(`b2b-reset-${c.id}-${Math.floor(Date.now() / 60000)}`, Object.assign({ to: [c.email] }, B2BM.passwordMail('reset', c, link, c.lang)));
    }
  } catch (e) { console.error('forgot failed', e.message); }
  return res.status(200).json({ ok: true });
}

async function catalog(req, res, c) {
  const { view, degraded } = await availabilityView();
  const products = Object.keys(CAVIARS).map((k) => ({
    id: k, name: CAVIARS[k].name, latin: CAVIARS[k].latin, stars: CAVIARS[k].stars,
    sizes: B2B_SIZES.map((g) => {
      const id = `${k}-${g}`;
      return { id, grams: g, cents: B2B_CATALOG[id].cents, status: view[id].status, inStock: view[id].inStock, mtoPossible: B2B_CATALOG[id].mto };
    }),
  }));
  const extras = Object.keys(B2B_CATALOG).filter((id) => !B2B_CATALOG[id].caviar).map((id) => ({ id, name: B2B_CATALOG[id].name, lt: B2B_CATALOG[id].lt, cents: B2B_CATALOG[id].cents, status: view[id] ? view[id].status : 'in' }));
  return res.status(200).json({
    customer: { company: c.company, contact_name: c.contact_name, email: c.email, phone: c.phone, street: c.street, postal_code: c.postal_code, city: c.city, company_code: c.company_code, vat_code: c.vat_code, lang: c.lang },
    products, extras, vatRate: VAT_RATE, minCents: B2B_MIN_CENTS, degraded: !!degraded,
  });
}

async function order(req, res, c) {
  if (await guard.over(req, 'b2b-order', { limit: 20, windowSec: 600 })) return res.status(429).json({ error: 'too_many' });
  const r = await placeOrder(c, body(req), {});
  return res.status(r.code).json(r.body);
}

async function orders(req, res, c) {
  const rows = await db.rest(`b2b_orders?select=ref,created_at,delivery,split,status,subtotal_cents,vat_cents,total_cents,po_ref,b2b_order_lines(name,qty,unit_cents,made_to_order,shipment_no),b2b_shipments(no,status,dpd_parcel,shipped_at)&customer_id=eq.${db.q(c.id)}&order=created_at.desc&limit=50`);
  const out = (rows || []).map((o) => Object.assign({}, o, {
    lines: o.b2b_order_lines, b2b_order_lines: undefined,
    shipments: (o.b2b_shipments || []).sort((a, b) => a.no - b.no).map((s) => Object.assign({}, s, { track: s.dpd_parcel ? DPD.trackingUrl(s.dpd_parcel) : null })), b2b_shipments: undefined,
  }));
  return res.status(200).json({ orders: out });
}

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const action = String((req.query && req.query.action) || '');
  if (action === 'config') return res.status(200).json({ url: db.URL(), key: db.PUBLIC(), on: db.enabled() });
  if (!db.enabled()) return res.status(503).json({ error: 'not_configured' });
  try {
    if (req.method === 'POST' && action === 'apply') return await apply(req, res);
    if (req.method === 'POST' && action === 'forgot') return await forgot(req, res);
    const c = await customerFor(req);
    if (!c) return res.status(401).json({ error: 'login' });
    if (req.method === 'GET' && action === 'catalog') return await catalog(req, res, c);
    if (req.method === 'POST' && action === 'order') return await order(req, res, c);
    if (req.method === 'GET' && action === 'orders') return await orders(req, res, c);
    return res.status(404).json({ error: 'unknown_action' });
  } catch (e) {
    console.error('b2b failed', action, e.message);
    return res.status(500).json({ error: 'failed' });
  }
};
