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

async function availabilityView() {
  try {
    const av = await stock.availability(process.env.STRIPE_SECRET_KEY || null, { fresh: true });
    return { av, view: stock.b2bView(av) };
  } catch (e) {
    console.error('b2b stock failed', e.message);
    return { av: null, view: stock.b2bView(null), degraded: true };
  }
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
  const b = body(req);
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 30) return res.status(400).json({ error: 'invalid_order' });
  const delivery = b.delivery === 'pickup' ? 'pickup' : 'dpd';
  const lang = b.lang === 'lt' ? 'lt' : (b.lang === 'en' ? 'en' : c.lang || 'en');
  if (delivery === 'dpd' && !(c.street && c.postal_code && c.city)) return res.status(400).json({ error: 'no_address' });
  if (await guard.over(req, 'b2b-order', { limit: 20, windowSec: 600 })) return res.status(429).json({ error: 'too_many' });

  const { av, view } = await availabilityView();
  const seen = new Set();
  const lines = [];
  const short = {};
  for (const it of items) {
    const id = String(it.id);
    const qty = Number(it.qty);
    const p = Object.prototype.hasOwnProperty.call(B2B_CATALOG, id) ? B2B_CATALOG[id] : null;
    if (!p || seen.has(id) || !Number.isInteger(qty) || qty < 1 || qty > 500) return res.status(400).json({ error: 'invalid_order' });
    seen.add(id);
    const inStock = view[id] ? view[id].inStock : 0;
    let mto = false;
    if (av && qty > inStock) {
      if (p.mto) mto = true; // 125 g / 250 g: ordered from Antonius
      else short[id] = inStock;
    } else if (!av && p.mto) mto = true; // stock not set up yet: big tins are made to order
    lines.push({ product_id: id, name: p.name, qty, unit_cents: p.cents, made_to_order: mto });
  }
  if (Object.keys(short).length) return res.status(409).json({ error: 'stock', available: short });

  const hasMto = lines.some((l) => l.made_to_order);
  const hasStock = lines.some((l) => !l.made_to_order);
  const split = !!b.split && hasMto && hasStock;
  for (const l of lines) l.shipment_no = split && l.made_to_order ? 2 : 1;
  const subtotal = lines.reduce((s, l) => s + l.unit_cents * l.qty, 0);
  if (delivery === 'dpd' && subtotal < B2B_MIN_CENTS) return res.status(400).json({ error: 'minimum', minCents: B2B_MIN_CENTS });
  const vat = Math.round(subtotal * VAT_RATE);

  const payload = {
    customer_id: c.id, delivery, split, po_ref: str(b.po_ref, 60), note: str(b.note, 300), lang,
    subtotal_cents: subtotal, vat_cents: vat, total_cents: subtotal + vat,
    ship_name: c.company, ship_phone: c.phone || '', ship_street: c.street || '', ship_postal_code: c.postal_code || '', ship_city: c.city || '',
    lines,
  };
  const created = await db.rpc('b2b_create_order', { p: payload });
  const row = Array.isArray(created) ? created[0] : created;
  const o = Object.assign({ id: row.order_id, ref: row.order_ref }, payload);
  if (hasMto && !split) await db.rest(`b2b_orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: 'waiting' }, prefer: 'return=minimal' });

  // Tins in stock going by DPD: create the shipment straight away, like the shop does.
  let d = null;
  const firstGoesNow = delivery === 'dpd' && !(hasMto && !split);
  if (firstGoesNow && DPD.mode() !== 'off' && process.env.DPD_API_TOKEN) {
    d = {};
    try {
      const s = await DPD.createShipment({ ref: o.ref + (split ? '-1' : ''), name: c.company, email: c.email, phone: c.phone || '', note: o.note, address: { line1: c.street, postal_code: c.postal_code, city: c.city, country: 'LT' } });
      d.parcel = s.parcel;
      await db.rest(`b2b_shipments?order_id=eq.${o.id}&no=eq.1`, { method: 'PATCH', body: { dpd_shipment: s.id, dpd_parcel: s.parcel, status: 'shipped', shipped_at: new Date().toISOString() }, prefer: 'return=minimal' });
      await db.rest(`b2b_orders?id=eq.${o.id}`, { method: 'PATCH', body: { status: split ? 'waiting' : 'shipped' }, prefer: 'return=minimal' });
      try { d.label = await DPD.labelPdf(s.id); } catch (e) { console.error('b2b label', e.message); }
      try { Object.assign(d, await DPD.bookPickupOnce(s.id)); } catch (e) { d.pickup = 'failed'; console.error('b2b pickup', e.message); }
    } catch (e) { d = { error: e.message.slice(0, 200) }; console.error('b2b dpd failed', e.message); }
  }

  const conf = B2BM.orderConfirmation(o, lines, c, d && d.parcel ? d : null);
  const internal = B2BM.internalOrder(o, lines, c, d);
  await Promise.all([
    mail.send(`b2b-order-${o.ref}-customer`, { to: [c.email], subject: conf.subject, html: conf.html }).catch((e) => console.error('b2b mail customer', e.message)),
    mail.send(`b2b-order-${o.ref}-internal`, { to: [mail.NOTIFY_TO], reply_to: c.email, subject: internal.subject, html: internal.html, attachments: internal.attachments }).catch((e) => console.error('b2b mail internal', e.message)),
  ]);
  return res.status(200).json({ ok: true, ref: o.ref, subtotal_cents: subtotal, vat_cents: vat, total_cents: subtotal + vat, madeToOrder: hasMto, split, parcel: d && d.parcel ? d.parcel : null });
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
