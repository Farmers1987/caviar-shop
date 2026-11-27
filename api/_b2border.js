// Places a B2B order: prices, stock, minimum and totals are worked out here.
// Used by the customer's order page (api/b2b.js) and by the admin when ordering for a customer.
const db = require('./_db.js');
const stock = require('./_stock.js');
const DPD = require('./_dpd.js');
const mail = require('./_mail.js');
const B2BM = require('./_b2bmail.js');
const { B2B_CATALOG, VAT_RATE, B2B_MIN_CENTS } = require('./_shared.js');

const str = (v, max) => String(v == null ? '' : v).trim().slice(0, max);
const R = (code, body) => ({ code, body });

async function availabilityView() {
  try {
    const av = await stock.availability(process.env.STRIPE_SECRET_KEY || null, { fresh: true });
    return { av, view: stock.b2bView(av) };
  } catch (e) {
    console.error('b2b stock failed', e.message);
    return { av: null, view: stock.b2bView(null), degraded: true };
  }
}

async function placeOrder(c, b, opts) {
  opts = opts || {};
  b = b || {};
  const items = Array.isArray(b.items) ? b.items : [];
  if (!items.length || items.length > 30) return R(400, { error: 'invalid_order' });
  const delivery = b.delivery === 'pickup' ? 'pickup' : 'dpd';
  const lang = b.lang === 'lt' ? 'lt' : (b.lang === 'en' ? 'en' : c.lang || 'en');
  if (delivery === 'dpd' && !(c.street && c.postal_code && c.city)) return R(400, { error: 'no_address' });

  const { av, view } = await availabilityView();
  const seen = new Set();
  const lines = [];
  const short = {};
  for (const it of items) {
    const id = String(it.id);
    const qty = Number(it.qty);
    const p = Object.prototype.hasOwnProperty.call(B2B_CATALOG, id) ? B2B_CATALOG[id] : null;
    if (!p || seen.has(id) || !Number.isInteger(qty) || qty < 1 || qty > 500) return R(400, { error: 'invalid_order' });
    seen.add(id);
    const inStock = view[id] ? view[id].inStock : 0;
    let mto = false;
    if (av && qty > inStock) {
      if (p.mto) mto = true; // 125 g / 250 g: ordered from Antonius
      else short[id] = inStock;
    } else if (!av && p.mto) mto = true; // stock not set up yet: big tins are made to order
    lines.push({ product_id: id, name: p.name, qty, unit_cents: p.cents, made_to_order: mto });
  }
  if (Object.keys(short).length) return R(409, { error: 'stock', available: short });

  const hasMto = lines.some((l) => l.made_to_order);
  const hasStock = lines.some((l) => !l.made_to_order);
  const split = !!b.split && hasMto && hasStock;
  for (const l of lines) l.shipment_no = split && l.made_to_order ? 2 : 1;
  const subtotal = lines.reduce((s, l) => s + l.unit_cents * l.qty, 0);
  if (delivery === 'dpd' && subtotal < B2B_MIN_CENTS && !opts.ignoreMinimum) return R(400, { error: 'minimum', minCents: B2B_MIN_CENTS });
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
  const internal = B2BM.internalOrder(o, lines, c, d, opts.byAdmin);
  await Promise.all([
    opts.noCustomerMail ? null : mail.send(`b2b-order-${o.ref}-customer`, { to: [c.email], subject: conf.subject, html: conf.html }).catch((e) => console.error('b2b mail customer', e.message)),
    mail.send(`b2b-order-${o.ref}-internal`, { to: [mail.NOTIFY_TO], reply_to: c.email, subject: internal.subject, html: internal.html, attachments: internal.attachments }).catch((e) => console.error('b2b mail internal', e.message)),
  ]);
  return R(200, { ok: true, ref: o.ref, subtotal_cents: subtotal, vat_cents: vat, total_cents: subtotal + vat, madeToOrder: hasMto, split, parcel: d && d.parcel ? d.parcel : null });
}

module.exports = { placeOrder, availabilityView };
