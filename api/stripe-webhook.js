// Stripe calls this when a payment is completed. It sends two mails:
// an order confirmation to the customer and an order notice to Farmers & Company.
//
// The event body is not trusted. The handler only takes the session id from it and
// then reads the session back from Stripe with the secret key, so a forged request
// cannot invent an order. A flag in the session's metadata prevents double sending.
// When DPD_MODE is set, it also books the DPD shipment first (see _dpd.js).

const DPD = require('./_dpd.js');
const LOGO = require('./_logo.js');

const FROM = process.env.ORDER_FROM || 'Farmers & Company <hello@farmersandcompany.lt>';
// hello@ only sends; replies and customer questions go to Steffen.
const REPLY_TO = process.env.ORDER_REPLY_TO || 'sp@farmersandcompany.lt';
const NOTIFY_TO = process.env.ORDER_NOTIFY_TO || 'sp@farmersandcompany.lt';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => (cents / 100).toFixed(2).replace('.', ',') + ' €';

async function stripe(path, key, body) {
  const r = await fetch('https://api.stripe.com/v1/' + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body || undefined,
  });
  return { ok: r.ok, data: await r.json() };
}

async function sendMail(apiKey, idempotencyKey, mail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    // The tag lets these mails be filtered apart from other projects in the same mail account.
    // The logo travels inside the mail (cid:fc-logo), so it shows even while the site is locked.
    body: JSON.stringify(Object.assign({ tags: [{ name: 'project', value: 'caviar-shop' }] }, mail, {
      attachments: [{ filename: 'farmers-company.png', content: LOGO, content_id: 'fc-logo' }].concat(mail.attachments || []),
    })),
  });
  if (!r.ok) throw new Error('mail ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

function orderFacts(session) {
  const details = session.customer_details || {};
  const shipping = (session.collected_information && session.collected_information.shipping_details) || session.shipping_details || {};
  const a = shipping.address || details.address || {};
  const items = ((session.line_items && session.line_items.data) || []).map((li) => ({
    name: li.description, qty: li.quantity, total: li.amount_total,
  }));
  const shippingCents = (session.shipping_cost && session.shipping_cost.amount_total) ||
    (session.total_details && session.total_details.amount_shipping) || 0;
  return {
    ref: session.id.slice(-8).toUpperCase(),
    name: shipping.name || details.name || '',
    email: details.email || '',
    phone: details.phone || '',
    address: a,
    note: (((session.custom_fields || []).find((f) => f.key === 'delivery_note') || {}).text || {}).value || '',
    addressLines: [a.line1, a.line2, [a.postal_code, a.city].filter(Boolean).join(' '), a.state, a.country].filter(Boolean),
    items, shippingCents, totalCents: session.amount_total || 0,
  };
}

const shell = (inner) => `<!doctype html><html><body style="margin:0;background:#f1eee4;font-family:Arial,Helvetica,sans-serif;color:#0e2219">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff">
<tr><td align="center" style="background:#0e2219;color:#f1eee4;padding:18px 28px;font-size:18px;letter-spacing:2px"><img src="cid:fc-logo" width="160" height="104" alt="FARMERS &amp; COMPANY" style="display:block;border:0;width:160px;height:auto;color:#f1eee4"></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">${inner}</td></tr>
</table></td></tr></table></body></html>`;

const itemRows = (o) => o.items.map((i) =>
  `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e0d6">${esc(i.qty)} × ${esc(i.name)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e3e0d6;white-space:nowrap">${money(i.total)}</td></tr>`).join('') +
  `<tr><td style="padding:8px 0;border-bottom:1px solid #e3e0d6">Delivery in Lithuania</td><td align="right" style="padding:8px 0;border-bottom:1px solid #e3e0d6;white-space:nowrap">${o.shippingCents ? money(o.shippingCents) : 'Free'}</td></tr>` +
  `<tr><td style="padding:10px 0"><strong>Total incl. VAT</strong></td><td align="right" style="padding:10px 0;white-space:nowrap"><strong>${money(o.totalCents)}</strong></td></tr>`;

function customerMail(o) {
  return shell(`<h1 style="margin:0 0 14px;font-size:24px">Thank you for your order</h1>
<p style="margin:0 0 18px">Hello ${esc(o.name)}, we have received your order and your payment. Order reference: <strong>${esc(o.ref)}</strong>.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${itemRows(o)}</table>
<h2 style="margin:24px 0 6px;font-size:17px">Delivery</h2>
<p style="margin:0 0 6px">We deliver your order chilled with DPD within 3 working days. DPD will also send you messages as the parcel moves.</p>
${o.parcel ? `<p style="margin:0 0 6px">DPD parcel number: <strong>${esc(o.parcel)}</strong> · <a href="${esc(DPD.trackingUrl(o.parcel))}" style="color:#0e2219">Track your parcel</a></p>` : ''}
<p style="margin:0 0 18px">${o.addressLines.map(esc).join('<br>')}${o.note ? `<br>Note for the courier: ${esc(o.note)}` : ''}</p>
<h2 style="margin:0 0 6px;font-size:17px">When it arrives</h2>
<p style="margin:0 0 18px">Put the tins in the fridge straight away, at −3 to +2 °C. Never freeze caviar. Once a tin is opened, enjoy it within 48 hours.</p>
<p style="margin:0">Questions about your order? Reply to this email or write to <a href="mailto:${esc(REPLY_TO)}" style="color:#0e2219">${esc(REPLY_TO)}</a>.</p>`);
}

function dpdBanner(o) {
  const box = (bg, html) => `<p style="margin:0 0 18px;padding:12px 14px;background:${bg}">${html}</p>`;
  const d = o.dpd || {};
  if (d.error) return box('#f3c9bf', `<strong>DPD-forsendelsen kunne ikke oprettes automatisk.</strong> Opret den og bestil afhentning i DPD-portalen i dag. Fejl: ${esc(d.error)}`);
  if (!o.parcel) return box('#f6e7b0', '<strong>Bestil DPD-afhentning i dag.</strong> Kunden er lovet levering inden for 3 hverdage.');
  let pickup;
  if (d.pickup === 'booked') pickup = `Afhentning er bestilt ${esc(d.plan.date)} kl. ${esc(d.plan.from)}–${esc(d.plan.to)}.`;
  else if (d.pickup === 'existing') pickup = `Der er allerede bestilt afhentning ${esc(d.plan.date)}; pakken skal med den.`;
  else if (d.pickup === 'failed') pickup = `<strong>Afhentningen kunne ikke bestilles automatisk; bestil den i DPD-portalen i dag.</strong> Fejl: ${esc(d.pickupError)}`;
  else pickup = '<strong>Afhentning er ikke bestilt (testtilstand); bestil den i DPD-portalen.</strong>';
  const late = d.plan && !d.plan.sameDay && d.pickup !== 'off' ? ' Ordren kom efter dagens frist, så den hentes næste hverdag.' : '';
  return box('#dff0e4', `<strong>DPD-forsendelse oprettet: ${esc(o.parcel)}.</strong> Labelen er vedhæftet; print den og sæt den på kølekassen. ${pickup}${late}`);
}

function internalMail(o) {
  return shell(`<h1 style="margin:0 0 14px;font-size:24px">Ny caviar-ordre ${esc(o.ref)}</h1>
${dpdBanner(o)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${itemRows(o)}</table>
<h2 style="margin:24px 0 6px;font-size:17px">Modtager</h2>
<p style="margin:0">${esc(o.name)}<br>${o.addressLines.map(esc).join('<br>')}<br>Telefon: ${esc(o.phone) || 'ikke oplyst'}<br>Mail: ${esc(o.email)}${o.note ? `<br><strong>Besked til kureren: ${esc(o.note)}</strong>` : ''}</p>`);
}

// Creates the DPD shipment, label and pickup. Never throws: a DPD problem must not stop the order mails.
async function shipWithDpd(session, o, key) {
  const m = DPD.mode();
  if (m === 'off' || !process.env.DPD_API_TOKEN) return;
  const meta = session.metadata || {};
  o.dpd = {};
  try {
    let shipmentId = meta.dpd_shipment, parcel = meta.dpd_parcel;
    if (!shipmentId) {
      const created = await DPD.createShipment(o);
      shipmentId = created.id; parcel = created.parcel;
      // Saved straight away so a retry by Stripe never creates a second shipment.
      await stripe(`checkout/sessions/${session.id}`, key, new URLSearchParams({ 'metadata[dpd_shipment]': shipmentId, 'metadata[dpd_parcel]': parcel }).toString());
    }
    o.parcel = parcel;
    try { o.label = await DPD.labelPdf(shipmentId); } catch (e) { console.error('DPD label failed', e.message); }

    const plan = DPD.pickupPlan();
    o.dpd.plan = plan;
    if (m !== 'full') { o.dpd.pickup = 'off'; return; }
    if (meta.dpd_pickup_date) { o.dpd.pickup = 'booked'; return; }
    // One pickup per day: look for another order today that already booked it.
    const since = Math.floor(Date.now() / 1000) - 3 * 86400;
    const others = await stripe(`checkout/sessions?limit=100&created[gte]=${since}`, key);
    const taken = others.ok && (others.data.data || []).some((x) => x.id !== session.id && x.metadata && x.metadata.dpd_pickup_date === plan.date);
    if (taken) { o.dpd.pickup = 'existing'; return; }
    try {
      await DPD.orderPickup(plan, shipmentId);
      o.dpd.pickup = 'booked';
      await stripe(`checkout/sessions/${session.id}`, key, new URLSearchParams({ 'metadata[dpd_pickup_date]': plan.date }).toString());
    } catch (e) { o.dpd.pickup = 'failed'; o.dpd.pickupError = e.message.slice(0, 200); console.error('DPD pickup failed', e.message); }
  } catch (e) {
    o.dpd.error = e.message.slice(0, 200);
    console.error('DPD shipment failed', e.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method_not_allowed' }); }
  const key = process.env.STRIPE_SECRET_KEY;
  const mailKey = process.env.RESEND_API_KEY;
  // 503 makes Stripe retry later, so orders placed before the mail key is set still get their mails.
  if (!key || !mailKey) return res.status(503).json({ error: 'not_configured' });

  let event = req.body;
  if (typeof event === 'string') { try { event = JSON.parse(event); } catch (e) { event = null; } }
  if (!event || event.type !== 'checkout.session.completed') return res.status(200).json({ ignored: true });
  const id = event.data && event.data.object && event.data.object.id;
  if (typeof id !== 'string' || !/^cs_(test|live)_[A-Za-z0-9]+$/.test(id)) return res.status(400).json({ error: 'bad_session' });

  try {
    const s = await stripe(`checkout/sessions/${id}?expand[]=line_items`, key);
    if (!s.ok) return res.status(400).json({ error: 'unknown_session' });
    const session = s.data;
    if (session.payment_status !== 'paid') return res.status(200).json({ ignored: true });
    if (session.metadata && session.metadata.mails_sent === '1') return res.status(200).json({ done: true });

    const o = orderFacts(session);
    await shipWithDpd(session, o, key);
    await sendMail(mailKey, id + '-internal', { from: FROM, to: [NOTIFY_TO], reply_to: o.email || REPLY_TO, subject: o.parcel && !(o.dpd && o.dpd.pickup === 'failed') ? `Ny caviar-ordre ${o.ref}: label vedhæftet` : `Ny caviar-ordre ${o.ref}: bestil DPD-afhentning i dag`, html: internalMail(o),
      attachments: o.label ? [{ filename: `DPD-label-${o.ref}.pdf`, content: o.label }] : undefined });
    if (o.email) {
      await sendMail(mailKey, id + '-customer', { from: FROM, to: [o.email], reply_to: REPLY_TO, subject: `Your caviar order ${o.ref} – Farmers & Company`, html: customerMail(o) });
    }
    await stripe(`checkout/sessions/${id}`, key, new URLSearchParams({ 'metadata[mails_sent]': '1' }).toString());
    return res.status(200).json({ done: true });
  } catch (e) {
    console.error('Order mail failed', e && e.message);
    return res.status(500).json({ error: 'mail_failed' });
  }
};
