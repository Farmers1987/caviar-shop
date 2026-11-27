// Stripe calls this when a payment is completed. It sends two mails:
// an order confirmation to the customer and an order notice to Farmers & Company.
//
// The event body is not trusted. The handler only takes the session id from it and
// then reads the session back from Stripe with the secret key, so a forged request
// cannot invent an order. A flag in the session's metadata prevents double sending.
// When DPD_MODE is set, it also books the DPD shipment first (see _dpd.js).

const DPD = require('./_dpd.js');
const LOGO = require('./_logo.js');
const stock = require('./_stock.js');
const { CATALOG } = require('./_shared.js');
// Public address of the shop, used for links in the mails. Change when the domain moves.
const SITE = (process.env.SITE_URL || 'https://caviar-shop.vercel.app').replace(/\/$/, '');

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
    lang: session.metadata && session.metadata.lang === 'lt' ? 'lt' : 'en',
    pickup: !!(session.metadata && session.metadata.delivery === 'pickup'),
    stockItems: session.metadata && session.metadata.items,
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

// Customer-facing texts. Danish is used only in the internal mail to us.
// The Lithuanian wording was reviewed by our marketing colleague; English follows the same structure.
const L = {
  en: {
    subject: (r) => `Your caviar order ${r} – Farmers & Company`,
    thanks: 'Thank you for your order',
    hello: (n) => `Hello ${n},`,
    received: (r) => `we have received your order and your payment. Your order number is <strong>${r}</strong>.`,
    item: 'Item', qty: 'Qty', amount: 'Amount',
    itemName: (name) => name,
    delivery: 'Delivery in Lithuania', free: 'Free', total: 'Total incl. VAT',
    hDelivery: 'Delivery',
    deliveryText: 'DPD will deliver your order within 3 working days. The products are kept chilled during delivery. DPD will keep you informed about your parcel by message.',
    parcel: 'DPD parcel number', track: 'Track your parcel',
    hAddress: 'Delivery address', country: { LT: 'Lithuania' }, note: 'Note for the courier',
    pickupRow: 'Pick-up at Dirva', hPickup: 'Pick-up',
    pickupText: 'You can collect your order at Dirva, Dominikonų g. 11, Vilnius, from the next working day, during Dirva\'s opening hours. Please bring your order number (for example this order confirmation) so the shop can check your order when you collect it.',
    map: 'Show on map',
    storagePickup: 'Put the caviar in the fridge as soon as you get home and keep it at −3 °C to +2 °C. Do not freeze the caviar. Once a tin is opened, enjoy it within 48 hours. The best-before date is printed on each tin.',
    returnsPickup: 'The 14-day right of withdrawal does not apply to caviar. If a product is faulty, please contact us. The caviar spoon and the tin opener can be returned within 14 days of collecting them.',
    hStorage: 'Storing the caviar',
    storage: 'When the parcel arrives, put the caviar in the fridge straight away and keep it at −3 °C to +2 °C. Do not freeze the caviar. Once a tin is opened, enjoy it within 48 hours. The best-before date is printed on each tin.',
    hQuestions: 'Questions and returns',
    questions: (m) => `If you have questions about your order, reply to this email or write to ${m}.`,
    returns: 'The 14-day right of withdrawal does not apply to caviar. If a product is faulty, please contact us. The caviar spoon and the tin opener can be returned within 14 days of receiving them.',
    links: ['Withdraw from contract', 'Terms of sale', 'Privacy policy'],
    bye: 'Kind regards,', team: 'The Farmers & Company team',
    sfx: '',
  },
  lt: {
    subject: (r) => `Jūsų ikrų užsakymas ${r} – Farmers & Company`,
    thanks: 'Dėkojame už užsakymą',
    hello: (n) => `Sveiki, ${n},`,
    received: (r) => `gavome Jūsų užsakymą ir apmokėjimą. Jūsų užsakymo numeris – <strong>${r}</strong>.`,
    item: 'Prekė', qty: 'Kiekis', amount: 'Suma',
    // "Antonius Caviar Siberian 6*, 30 g" → „Antonius Caviar Siberian 6*“ ikrai, 30 g
    itemName: (name) => { const m = /^(Antonius Caviar [^,]+), (.+)$/.exec(name); return m ? `„${m[1]}“ ikrai, ${m[2]}` : name; },
    delivery: 'Pristatymas Lietuvoje', free: 'Nemokamas', total: 'Iš viso su PVM',
    hDelivery: 'Pristatymas',
    deliveryText: 'Jūsų užsakymą per 3 darbo dienas pristatys DPD. Pristatymo metu prekės bus laikomos atšaldytos. Apie siuntos eigą DPD Jus informuos pranešimais.',
    parcel: 'DPD siuntos numeris', track: 'Sekti siuntą',
    hAddress: 'Pristatymo adresas', country: { LT: 'Lietuva' }, note: 'Pastaba kurjeriui',
    pickupRow: 'Atsiėmimas „Dirvoje“', hPickup: 'Atsiėmimas',
    pickupText: 'Užsakymą galėsite atsiimti „Dirvoje“, Dominikonų g. 11, Vilniuje, nuo kitos darbo dienos „Dirvos“ darbo valandomis. Atvykdami turėkite užsakymo numerį (pvz., šį užsakymo patvirtinimą), kad parduotuvėje galėtume patikrinti Jūsų užsakymą.',
    map: 'Rodyti žemėlapyje',
    storagePickup: 'Grįžę namo, ikrus iš karto įdėkite į šaldytuvą ir laikykite nuo −3 °C iki +2 °C temperatūroje. Ikrų neužšaldykite. Atidarius pakuotę, ikrus suvartokite per 48 valandas. Data „Geriausias iki“ nurodyta ant kiekvienos pakuotės.',
    returnsPickup: 'Ikrams 14 dienų sutarties atsisakymo teisė netaikoma. Jei gavote nekokybišką prekę, susisiekite su mumis. Ikrų šaukštelį ir skardinių atidarytuvą galite grąžinti per 14 dienų nuo prekės atsiėmimo.',
    hStorage: 'Ikrų laikymas',
    storage: 'Gavę siuntą, ikrus iš karto įdėkite į šaldytuvą ir laikykite nuo −3 °C iki +2 °C temperatūroje. Ikrų neužšaldykite. Atidarius pakuotę, ikrus suvartokite per 48 valandas. Data „Geriausias iki“ nurodyta ant kiekvienos pakuotės.',
    hQuestions: 'Klausimai ir prekių grąžinimas',
    questions: (m) => `Jei turite klausimų dėl užsakymo, atsakykite į šį laišką arba parašykite ${m}.`,
    returns: 'Ikrams 14 dienų sutarties atsisakymo teisė netaikoma. Jei gavote nekokybišką prekę, susisiekite su mumis. Ikrų šaukštelį ir skardinių atidarytuvą galite grąžinti per 14 dienų nuo prekės gavimo.',
    links: ['Atsisakyti pirkimo sutarties', 'Pirkimo taisyklės', 'Privatumo politika'],
    bye: 'Pagarbiai', team: '„Farmers & Company“ komanda',
    sfx: '-lt',
  },
};

const td = 'padding:9px 0;border-bottom:1px solid #e3e0d6;vertical-align:top';
const itemRows = (o, t) =>
  `<tr><th align="left" style="padding:0 0 6px;border-bottom:1px solid #c9c4b4;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4c5a52;font-weight:600">${t.item}</th>`
  + `<th align="center" style="padding:0 8px 6px;border-bottom:1px solid #c9c4b4;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4c5a52;font-weight:600;width:60px">${t.qty}</th>`
  + `<th align="right" style="padding:0 0 6px;border-bottom:1px solid #c9c4b4;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4c5a52;font-weight:600;width:90px">${t.amount}</th></tr>`
  + o.items.map((i) => `<tr><td style="${td}">${esc(t.itemName(i.name))}</td><td align="center" style="${td};padding-left:8px;padding-right:8px">${esc(i.qty)}</td><td align="right" style="${td};white-space:nowrap">${money(i.total)}</td></tr>`).join('')
  + `<tr><td colspan="2" style="${td}">${o.pickup ? t.pickupRow : t.delivery}</td><td align="right" style="${td};white-space:nowrap">${o.shippingCents ? money(o.shippingCents) : t.free}</td></tr>`
  + `<tr><td colspan="2" style="padding:11px 0"><strong>${t.total}</strong></td><td align="right" style="padding:11px 0;white-space:nowrap"><strong>${money(o.totalCents)}</strong></td></tr>`;

function addressBlock(o, t) {
  const a = o.address || {};
  const street = [a.line1, a.line2].filter(Boolean).join(', ');
  const city = [a.postal_code, a.city].filter(Boolean).join(' ') + (a.country ? ', ' + (t.country[a.country] || a.country) : '');
  return [o.name, street, city].filter(Boolean).map(esc).join('<br>');
}

function customerMail(o) {
  const t = L[o.lang] || L.en;
  const g = '#4c5a52';
  const h2 = (x) => `<h2 style="margin:26px 0 6px;font-size:17px">${x}</h2>`;
  const first = String(o.name || '').trim().split(/\s+/)[0] || '';
  const link = (path, text) => `<a href="${SITE}/${path}${t.sfx}.html" style="color:${g}">${text}</a>`;
  return shell(`<h1 style="margin:0 0 14px;font-size:24px">${t.thanks}</h1>
<p style="margin:0 0 18px">${t.hello(esc(first))}<br>${t.received(esc(o.ref))}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${itemRows(o, t)}</table>
${o.pickup ? `${h2(t.hPickup)}
<p style="margin:0 0 12px">${t.pickupText}</p>
<p style="margin:0 0 6px"><a href="${PICKUP_MAP}" style="display:inline-block;background:#0e2219;color:#f1eee4;text-decoration:none;padding:11px 20px;font-size:14px;font-weight:bold">${t.map}</a></p>` : `${h2(t.hDelivery)}
<p style="margin:0 0 10px">${t.deliveryText}</p>
${o.parcel ? `<p style="margin:0 0 14px">${t.parcel} – <strong>${esc(o.parcel)}</strong></p>
<p style="margin:0 0 6px"><a href="${esc(DPD.trackingUrl(o.parcel))}" style="display:inline-block;background:#0e2219;color:#f1eee4;text-decoration:none;padding:11px 20px;font-size:14px;font-weight:bold">${t.track}</a></p>` : ''}
${h2(t.hAddress)}
<p style="margin:0">${addressBlock(o, t)}</p>
${o.note ? `<p style="margin:8px 0 0">${t.note} – ${esc(o.note)}</p>` : ''}`}
${h2(t.hStorage)}
<p style="margin:0">${o.pickup ? t.storagePickup : t.storage}</p>
${h2(t.hQuestions)}
<p style="margin:0 0 10px">${t.questions(`<a href="mailto:${esc(REPLY_TO)}" style="color:#0e2219">${esc(REPLY_TO)}</a>`)}</p>
<p style="margin:0 0 14px">${o.pickup ? t.returnsPickup : t.returns}</p>
<p style="margin:0 0 22px;font-size:13px;color:${g}">${link('withdraw', t.links[0])} · ${link('terms', t.links[1])} · ${link('privacy', t.links[2])}</p>
<p style="margin:0">${t.bye}<br>${t.team}</p>`);
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

const PICKUP_MAP = 'https://www.google.com/maps/search/?api=1&query=Dominikon%C5%B3%20g.%2011%2C%2001131%20Vilnius';

function internalMail(o) {
  if (o.pickup) {
    return shell(`<h1 style="margin:0 0 14px;font-size:24px">Ny caviar-ordre ${esc(o.ref)}: afhentning i Dirva</h1>
${o.oversold ? `<p style="margin:0 0 18px;padding:12px 14px;background:#f3c9bf"><strong>Lageret slog ikke til:</strong> ${esc(o.oversold)}. To kunder har købt de sidste dåser samtidig. Kontakt kunden om levering eller refusion.</p>` : ''}
<p style="margin:0 0 18px;padding:12px 14px;background:#f6e7b0"><strong>Kunden henter ordren i Dirva, Dominikonų g. 11.</strong> Kunden er lovet, at den ligger klar fra næste hverdag. Bring den til Dirva og sørg for, at den står på køl, mærket med ordrenummer ${esc(o.ref)} og kundens navn.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${itemRows(o, L.en)}</table>
<h2 style="margin:24px 0 6px;font-size:17px">Kunde${o.lang === 'lt' ? ' (handlede på litauisk)' : ''}</h2>
<p style="margin:0">${esc(o.name)}<br>Telefon: ${esc(o.phone) || 'ikke oplyst'}<br>Mail: ${esc(o.email)}</p>`);
  }
  return shell(`<h1 style="margin:0 0 14px;font-size:24px">Ny caviar-ordre ${esc(o.ref)}</h1>
${o.oversold ? `<p style="margin:0 0 18px;padding:12px 14px;background:#f3c9bf"><strong>Lageret slog ikke til:</strong> ${esc(o.oversold)}. To kunder har købt de sidste dåser samtidig. Kontakt kunden om levering eller refusion.</p>` : ''}
${dpdBanner(o)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px">${itemRows(o, L.en)}</table>
<h2 style="margin:24px 0 6px;font-size:17px">Modtager${o.lang === 'lt' ? ' (handlede på litauisk)' : ''}</h2>
<p style="margin:0">${esc(o.name)}<br>${o.addressLines.map(esc).join('<br>')}<br>Telefon: ${esc(o.phone) || 'ikke oplyst'}<br>Mail: ${esc(o.email)}${o.note ? `<br><strong>Besked til kureren: ${esc(o.note)}</strong>` : ''}</p>`);
}

// Creates the DPD shipment, label and pickup. Never throws: a DPD problem must not stop the order mails.
async function shipWithDpd(session, o, key) {
  if (o.pickup) return; // picked up at Dirva: no DPD shipment
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
    const taken = (others.ok && (others.data.data || []).some((x) => x.id !== session.id && x.metadata && x.metadata.dpd_pickup_date === plan.date))
      || await DPD.pickupMarked(plan.date).catch(() => false); // a B2B order may have booked it
    if (taken) { o.dpd.pickup = 'existing'; return; }
    try {
      await DPD.orderPickup(plan, shipmentId);
      o.dpd.pickup = 'booked';
      await DPD.markPickup(plan.date).catch(() => {});
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
    // Did two customers buy the last tins at the same time? Then tell us in the internal mail.
    try {
      const av = await stock.availability(key, { fresh: true });
      if (av && o.stockItems) {
        const mine = stock.decodeItems(o.stockItems);
        const over = Object.keys(mine).filter((k) => av.available[k] < 0).map((k) => `${CATALOG[k].name} mangler ${-av.available[k]} stk.`);
        if (over.length) o.oversold = over.join(', ');
      }
    } catch (e) { console.error('stock check after payment failed', e.message); }
    await shipWithDpd(session, o, key);
    await sendMail(mailKey, id + '-internal', { from: FROM, to: [NOTIFY_TO], reply_to: o.email || REPLY_TO, subject: o.pickup ? `Ny caviar-ordre ${o.ref}: afhentning i Dirva` : o.parcel && !(o.dpd && o.dpd.pickup === 'failed') ? `Ny caviar-ordre ${o.ref}: label vedhæftet` : `Ny caviar-ordre ${o.ref}: bestil DPD-afhentning i dag`, html: internalMail(o),
      attachments: o.label ? [{ filename: `DPD-label-${o.ref}.pdf`, content: o.label }] : undefined });
    if (o.email) {
      await sendMail(mailKey, id + '-customer', { from: FROM, to: [o.email], reply_to: REPLY_TO, subject: (L[o.lang] || L.en).subject(o.ref), html: customerMail(o) });
    }
    await stripe(`checkout/sessions/${id}`, key, new URLSearchParams({ 'metadata[mails_sent]': '1' }).toString());
    return res.status(200).json({ done: true });
  } catch (e) {
    console.error('Order mail failed', e && e.message);
    return res.status(500).json({ error: 'mail_failed' });
  }
};
