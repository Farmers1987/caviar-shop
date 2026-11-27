// Admin for B2B: applications, customers, orders, deliveries and invoices.
// Protected by the same ADMIN_PASSWORD and attempt limits as the stock page.
//   GET  ?action=overview
//   POST ?action=approve | reject | resend | customer | ship | ready | collected | invoice | cancel

const crypto = require('crypto');
const db = require('./_db.js');
const guard = require('./_guard.js');
const DPD = require('./_dpd.js');
const mail = require('./_mail.js');
const B2BM = require('./_b2bmail.js');

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
function allowed(req) {
  const want = process.env.ADMIN_PASSWORD || '';
  const got = String(req.headers['x-admin-password'] || '');
  if (want.length < 12 || !got) return false;
  return crypto.timingSafeEqual(crypto.createHash('sha256').update(want).digest(), crypto.createHash('sha256').update(got).digest());
}
function body(req) {
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = null; } }
  return b && typeof b === 'object' ? b : {};
}
const int = (v) => (Number.isInteger(Number(v)) ? Number(v) : null);

async function loadOrder(id) {
  const rows = await db.rest(`b2b_orders?select=*,b2b_order_lines(*),b2b_shipments(*),b2b_customers(*)&id=eq.${int(id)}`);
  const o = rows && rows[0];
  if (!o) return null;
  o.lines = o.b2b_order_lines || []; o.shipments = (o.b2b_shipments || []).sort((a, b) => a.no - b.no); o.customer = o.b2b_customers;
  return o;
}
const linesFor = (o, no) => (o.shipments.length > 1 ? o.lines.filter((l) => l.shipment_no === no) : o.lines);

// The order's status follows its deliveries.
async function syncStatus(o) {
  const s = o.shipments;
  let status;
  if (o.status === 'cancelled') return;
  if (s.every((x) => x.status === 'shipped' || x.status === 'collected')) status = o.delivery === 'pickup' ? 'done' : 'shipped';
  else if (s.some((x) => x.status === 'ready')) status = 'ready';
  else if (s.some((x) => x.status === 'shipped' || x.status === 'collected') || o.lines.some((l) => l.made_to_order)) status = 'waiting';
  else status = 'new';
  if (status !== o.status) await db.rest(`b2b_orders?id=eq.${o.id}`, { method: 'PATCH', body: { status }, prefer: 'return=minimal' });
}
async function patchShipment(o, no, fields) {
  await db.rest(`b2b_shipments?order_id=eq.${o.id}&no=eq.${no}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
  const s = o.shipments.find((x) => x.no === no); Object.assign(s, fields);
}

async function overview(res) {
  const [apps, orders, customers] = await Promise.all([
    db.rest('b2b_applications?select=*&order=created_at.desc&limit=100'),
    db.rest('b2b_orders?select=*,b2b_order_lines(*),b2b_shipments(*),b2b_customers(company,contact_name,email,phone,street,postal_code,city)&order=created_at.desc&limit=200'),
    db.rest('b2b_customers?select=*&order=company.asc&limit=500'),
  ]);
  return res.status(200).json({
    applications: apps || [], customers: customers || [],
    orders: (orders || []).map((o) => ({
      id: o.id, ref: o.ref, created_at: o.created_at, delivery: o.delivery, split: o.split, status: o.status, po_ref: o.po_ref, note: o.note,
      subtotal_cents: o.subtotal_cents, vat_cents: o.vat_cents, total_cents: o.total_cents, customer: o.b2b_customers,
      ship: { street: o.ship_street, postal_code: o.ship_postal_code, city: o.ship_city },
      lines: o.b2b_order_lines || [],
      shipments: (o.b2b_shipments || []).sort((a, b) => a.no - b.no).map((s) => Object.assign({}, s, { track: s.dpd_parcel ? DPD.trackingUrl(s.dpd_parcel) : null })),
    })),
    dpd: DPD.mode(),
  });
}

async function approve(req, res) {
  const b = body(req);
  const rows = await db.rest(`b2b_applications?select=*&id=eq.${int(b.id)}`);
  const a = rows && rows[0];
  if (!a) return res.status(404).json({ error: 'not_found' });
  if (a.status !== 'pending') return res.status(409).json({ error: 'already_decided' });
  const c = {
    company: str(b.company, 120) || a.company, company_code: str(b.company_code, 30) || a.company_code, vat_code: str(b.vat_code, 30) || a.vat_code,
    contact_name: str(b.contact_name, 100) || a.contact_name, email: a.email, phone: str(b.phone, 40) || a.phone,
    street: str(b.street, 120), postal_code: str(b.postal_code, 12), city: str(b.city, 60), lang: b.lang === 'lt' || b.lang === 'en' ? b.lang : a.lang, application_id: a.id,
  };
  if (!c.street || !c.postal_code || !c.city) return res.status(400).json({ error: 'address' });
  let user;
  try { user = await db.createUser(a.email, { company: c.company }); }
  catch (e) { if (e.status === 422 || e.status === 400) return res.status(409).json({ error: 'email_exists' }); throw e; }
  c.id = user.id || (user.user && user.user.id);
  await db.rest('b2b_customers', { method: 'POST', body: c, prefer: 'return=minimal' });
  await db.rest(`b2b_applications?id=eq.${a.id}`, { method: 'PATCH', body: { status: 'approved', decided_at: new Date().toISOString() }, prefer: 'return=minimal' });
  await sendWelcome(c);
  return res.status(200).json({ ok: true });
}

async function sendWelcome(c) {
  const token = await db.passwordToken(c.email);
  const link = `${mail.SITE}/b2b/password.html?t=${encodeURIComponent(token)}&new=1${c.lang === 'lt' ? '&lang=lt' : ''}`;
  await mail.send(`b2b-welcome-${c.id}-${Math.floor(Date.now() / 60000)}`, Object.assign({ to: [c.email] }, B2BM.passwordMail('welcome', c, link, c.lang)));
}

async function reject(req, res) {
  const b = body(req);
  await db.rest(`b2b_applications?id=eq.${int(b.id)}&status=eq.pending`, { method: 'PATCH', body: { status: 'rejected', decided_at: new Date().toISOString() }, prefer: 'return=minimal' });
  return res.status(200).json({ ok: true });
}

async function resend(req, res) {
  const rows = await db.rest(`b2b_customers?select=*&id=eq.${db.q(str(body(req).id, 60))}`);
  if (!rows || !rows[0]) return res.status(404).json({ error: 'not_found' });
  await sendWelcome(rows[0]);
  return res.status(200).json({ ok: true });
}

async function customer(req, res) {
  const b = body(req);
  const fields = {};
  for (const [k, max] of [['company', 120], ['contact_name', 100], ['phone', 40], ['street', 120], ['postal_code', 12], ['city', 60], ['vat_code', 30], ['company_code', 30]]) if (b[k] !== undefined) fields[k] = str(b[k], max);
  if (b.active !== undefined) fields.active = !!b.active;
  if (b.lang === 'lt' || b.lang === 'en') fields.lang = b.lang;
  await db.rest(`b2b_customers?id=eq.${db.q(str(b.id, 60))}`, { method: 'PATCH', body: fields, prefer: 'return=minimal' });
  return res.status(200).json({ ok: true });
}

// Send one delivery with DPD (or record a parcel number made by hand), and mail the tracking link.
async function ship(req, res) {
  const b = body(req);
  const o = await loadOrder(b.order_id);
  const no = int(b.no) || 1;
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.delivery !== 'dpd') return res.status(400).json({ error: 'pickup_order' });
  const s = o.shipments.find((x) => x.no === no);
  if (!s || s.status === 'shipped') return res.status(409).json({ error: 'already_shipped' });
  const c = o.customer;
  let label = null;
  let pickup = null;
  const manual = str(b.parcel, 40);
  if (manual) {
    await patchShipment(o, no, { dpd_parcel: manual, status: 'shipped', shipped_at: new Date().toISOString() });
  } else {
    if (DPD.mode() === 'off' || !process.env.DPD_API_TOKEN) return res.status(400).json({ error: 'dpd_off' });
    const ref = o.ref + (o.shipments.length > 1 ? '-' + no : '');
    const created = await DPD.createShipment({ ref, name: c.company, email: c.email, phone: o.ship_phone || c.phone || '', note: o.note, address: { line1: o.ship_street, postal_code: o.ship_postal_code, city: o.ship_city, country: 'LT' } });
    await patchShipment(o, no, { dpd_shipment: created.id, dpd_parcel: created.parcel, status: 'shipped', shipped_at: new Date().toISOString() });
    try { label = await DPD.labelPdf(created.id); } catch (e) { console.error('label', e.message); }
    try { pickup = await DPD.bookPickupOnce(created.id); } catch (e) { pickup = { pickup: 'failed', error: e.message.slice(0, 200) }; }
  }
  // Made-to-order tins sent from stock that just arrived are not counted against the shared stock.
  await syncStatus(o);
  const m = B2BM.shippedMail(o, s, linesFor(o, no), c, o.shipments.length);
  await mail.send(`b2b-ship-${o.ref}-${no}`, { to: [c.email], subject: m.subject, html: m.html }).catch((e) => console.error('ship mail', e.message));
  return res.status(200).json({ ok: true, parcel: s.dpd_parcel, label, pickup });
}

async function ready(req, res) {
  const b = body(req);
  const o = await loadOrder(b.order_id);
  const no = int(b.no) || 1;
  if (!o) return res.status(404).json({ error: 'not_found' });
  if (o.delivery !== 'pickup') return res.status(400).json({ error: 'dpd_order' });
  await patchShipment(o, no, { status: 'ready' });
  await syncStatus(o);
  const m = B2BM.readyMail(o, linesFor(o, no), o.customer);
  await mail.send(`b2b-ready-${o.ref}-${no}`, { to: [o.customer.email], subject: m.subject, html: m.html }).catch((e) => console.error('ready mail', e.message));
  return res.status(200).json({ ok: true });
}

async function collected(req, res) {
  const b = body(req);
  const o = await loadOrder(b.order_id);
  if (!o) return res.status(404).json({ error: 'not_found' });
  await patchShipment(o, int(b.no) || 1, { status: 'collected', shipped_at: new Date().toISOString() });
  await syncStatus(o);
  return res.status(200).json({ ok: true });
}

async function invoice(req, res) {
  const b = body(req);
  const on = !!b.value;
  await db.rest(`b2b_shipments?order_id=eq.${int(b.order_id)}&no=eq.${int(b.no) || 1}`, { method: 'PATCH', body: { invoiced: on, invoiced_at: on ? new Date().toISOString() : null }, prefer: 'return=minimal' });
  return res.status(200).json({ ok: true });
}

async function cancel(req, res) {
  const b = body(req);
  // Cancelled orders no longer count against the stock, so their tins are free again.
  await db.rest(`b2b_orders?id=eq.${int(b.order_id)}`, { method: 'PATCH', body: { status: 'cancelled' }, prefer: 'return=minimal' });
  await db.rest(`b2b_shipments?order_id=eq.${int(b.order_id)}&status=in.(pending,ready)`, { method: 'PATCH', body: { status: 'cancelled' }, prefer: 'return=minimal' });
  return res.status(200).json({ ok: true });
}

const ACTIONS = { approve, reject, resend, customer, ship, ready, collected, invoice, cancel };

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');
  if ((process.env.ADMIN_PASSWORD || '').length < 12) return res.status(503).json({ error: 'no_password' });
  if (await guard.adminLocked(req)) return res.status(429).json({ error: 'locked' });
  if (!allowed(req)) {
    if (req.headers['x-admin-password']) await guard.adminFailed(req);
    await new Promise((r) => setTimeout(r, 600));
    return res.status(401).json({ error: 'wrong_password' });
  }
  if (!db.enabled()) return res.status(503).json({ error: 'no_database' });
  const action = String((req.query && req.query.action) || '');
  try {
    if (req.method === 'GET' && action === 'overview') return await overview(res);
    if (req.method === 'POST' && ACTIONS[action]) return await ACTIONS[action](req, res);
    return res.status(404).json({ error: 'unknown_action' });
  } catch (e) {
    console.error('b2b admin failed', action, e.message);
    return res.status(500).json({ error: 'failed', detail: e.message.slice(0, 200) });
  }
};
