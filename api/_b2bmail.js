// Mails for the B2B part. Customer mails in English or Lithuanian, internal mails in Danish.
const { SITE, NOTIFY_TO, esc, money, shell, button, h2, box } = require('./_mail.js');
const DPD = require('./_dpd.js');

const DIRVA = 'Dirva, Dominikonų g. 11, Vilnius';
const DIRVA_LT = '„Dirvoje“, Dominikonų g. 11, Vilniuje';
const MAP = 'https://www.google.com/maps/search/?api=1&query=Dominikon%C5%B3%20g.%2011%2C%2001131%20Vilnius';

const T = {
  en: {
    hello: (n) => `Hello ${n},`,
    item: 'Item', qty: 'Qty', amount: 'Excl. VAT', subtotal: 'Subtotal excl. VAT', vat: 'VAT 21 %', total: 'Total incl. VAT', delivery: 'Delivery', free: 'Free',
    mto: 'made to order',
    orderSubject: (r) => `Your caviar order ${r} – Farmers & Company`,
    orderH: 'Thank you for your order',
    orderIntro: (r) => `we have received your order <strong>${r}</strong>. You will receive an invoice by email when it ships, payment within 14 days.`,
    planDpdNow: 'Your order is sent chilled with DPD, free of charge. You will get the parcel number and a tracking link when it leaves us.',
    planPickupNow: `Your order will be ready to collect at ${DIRVA} from the next working day, during Dirva's opening hours. We email you when it is ready. Please bring your order number.`,
    planSplit: 'You chose two deliveries: the tins in stock go now, the made-to-order tins follow when they arrive, usually within a week. Each delivery is invoiced when it ships.',
    planTogether: 'Your order includes made-to-order tins, so we send everything together when they arrive, usually within a week. We confirm the date by email.',
    december: 'In December we cannot promise made-to-order tins before Christmas. We confirm the date by email.',
    hDetails: 'Your details', po: 'Your reference', note: 'Note',
    shippedSubject: (r, n) => `Your caviar order ${r}${n ? ` (delivery ${n})` : ''} is on its way`,
    shippedH: 'Your order is on its way',
    shippedText: 'DPD delivers your caviar chilled, usually within 1–3 working days. DPD will keep you informed by message.',
    parcel: 'DPD parcel number', track: 'Track your parcel',
    readySubject: (r) => `Your caviar order ${r} is ready to collect`,
    readyH: 'Ready to collect',
    readyText: `Your order is ready at ${DIRVA}, during Dirva's opening hours. Please bring your order number so the shop can check your order.`,
    map: 'Show on map',
    storage: 'Keep the caviar in the fridge at −3 °C to +2 °C and never freeze it. Once a tin is opened, use it within 48 hours. The best-before date is printed on each tin.',
    questions: 'Questions? Reply to this email or write to sp@farmersandcompany.lt.',
    bye: 'Kind regards,', team: 'The Farmers & Company team',
    welcomeSubject: 'Your business account – Farmers & Company',
    welcomeH: 'Welcome',
    welcomeText: (c) => `your business account for <strong>${c}</strong> is ready. Choose a password to log in and order Antonius Caviar at trade prices.`,
    welcomeBtn: 'Choose your password',
    linkNote: 'The link works once and expires after 24 hours. If it has expired, use "Forgot your password?" on the login page.',
    resetSubject: 'Choose a new password – Farmers & Company',
    resetH: 'Choose a new password',
    resetText: 'we received a request to set a new password for your business account. If it was not you, you can ignore this email.',
    resetBtn: 'Choose a new password',
    appSubject: 'We have received your application – Farmers & Company',
    appH: 'Thank you for your application',
    appText: (c) => `we have received your application for a business account for <strong>${c}</strong>. We check the details and get back to you, usually within one working day.`,
  },
  lt: {
    hello: (n) => `Sveiki, ${n},`,
    item: 'Prekė', qty: 'Kiekis', amount: 'Be PVM', subtotal: 'Suma be PVM', vat: 'PVM 21 %', total: 'Iš viso su PVM', delivery: 'Pristatymas', free: 'Nemokamas',
    mto: 'gaminama pagal užsakymą',
    orderSubject: (r) => `Jūsų ikrų užsakymas ${r} – Farmers & Company`,
    orderH: 'Dėkojame už užsakymą',
    orderIntro: (r) => `gavome Jūsų užsakymą <strong>${r}</strong>. Išsiuntus užsakymą, sąskaitą faktūrą gausite el. paštu; apmokėjimo terminas – 14 dienų.`,
    planDpdNow: 'Užsakymą atvėsintą nemokamai pristatys DPD. Kai siunta bus išsiųsta, gausite siuntos numerį ir sekimo nuorodą.',
    planPickupNow: `Užsakymą galėsite atsiimti ${DIRVA_LT} nuo kitos darbo dienos „Dirvos“ darbo valandomis. Kai užsakymas bus paruoštas, informuosime el. paštu. Atvykdami turėkite užsakymo numerį.`,
    planSplit: 'Pasirinkote du pristatymus: sandėlyje esančias skardines siunčiame dabar, o pagal užsakymą gaminamas – kai jas gausime, dažniausiai per savaitę. Už kiekvieną pristatymą išrašoma atskira sąskaita.',
    planTogether: 'Jūsų užsakyme yra pagal užsakymą gaminamų skardinių, todėl viską išsiųsime kartu, kai jas gausime, dažniausiai per savaitę. Datą patvirtinsime el. paštu.',
    december: 'Gruodžio mėnesį negalime garantuoti, kad pagal užsakymą gaminamas skardines gausite iki Kalėdų. Datą patvirtinsime el. paštu.',
    hDetails: 'Jūsų duomenys', po: 'Jūsų nuoroda', note: 'Pastaba',
    shippedSubject: (r, n) => `Jūsų ikrų užsakymas ${r}${n ? ` (pristatymas Nr. ${n})` : ''} jau pakeliui`,
    shippedH: 'Užsakymas jau pakeliui',
    shippedText: 'DPD atvėsintus ikrus dažniausiai pristato per 1–3 darbo dienas. Apie siuntos eigą DPD Jus informuos pranešimais.',
    parcel: 'DPD siuntos numeris', track: 'Sekti siuntą',
    readySubject: (r) => `Jūsų ikrų užsakymas ${r} paruoštas atsiimti`,
    readyH: 'Paruošta atsiimti',
    readyText: `Užsakymą galite atsiimti ${DIRVA_LT} „Dirvos“ darbo valandomis. Atvykdami turėkite užsakymo numerį, kad parduotuvėje galėtume patikrinti Jūsų užsakymą.`,
    map: 'Rodyti žemėlapyje',
    storage: 'Ikrus laikykite šaldytuve nuo −3 °C iki +2 °C ir neužšaldykite. Atidarius skardinę, ikrus suvartokite per 48 valandas. Data „Geriausias iki“ nurodyta ant kiekvienos skardinės.',
    questions: 'Turite klausimų? Atsakykite į šį laišką arba rašykite sp@farmersandcompany.lt.',
    bye: 'Pagarbiai', team: '„Farmers & Company“ komanda',
    welcomeSubject: 'Jūsų verslo paskyra – Farmers & Company',
    welcomeH: 'Sveiki atvykę',
    welcomeText: (c) => `įmonės <strong>${c}</strong> verslo paskyra paruošta. Susikurkite slaptažodį, kad galėtumėte prisijungti ir užsisakyti „Antonius Caviar“ ikrų didmeninėmis kainomis.`,
    welcomeBtn: 'Susikurti slaptažodį',
    linkNote: 'Nuoroda veikia vieną kartą ir galioja 24 valandas. Jei ji nebegalioja, prisijungimo puslapyje pasirinkite „Pamiršote slaptažodį?“.',
    resetSubject: 'Naujas slaptažodis – Farmers & Company',
    resetH: 'Susikurkite naują slaptažodį',
    resetText: 'gavome prašymą nustatyti naują Jūsų verslo paskyros slaptažodį. Jei to neprašėte, šį laišką galite ignoruoti.',
    resetBtn: 'Susikurti naują slaptažodį',
    appSubject: 'Gavome Jūsų paraišką – Farmers & Company',
    appH: 'Dėkojame už paraišką',
    appText: (c) => `gavome įmonės <strong>${c}</strong> paraišką verslo paskyrai. Patikrinsime duomenis ir susisieksime, dažniausiai per vieną darbo dieną.`,
  },
};
const t = (lang) => T[lang] || T.en;
const first = (n) => String(n || '').trim().split(/\s+/)[0] || '';
const td = 'padding:9px 0;border-bottom:1px solid #e3e0d6;vertical-align:top';
const th = 'padding:0 0 6px;border-bottom:1px solid #c9c4b4;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#4c5a52;font-weight:600';

function lineTable(o, lines, L, opts) {
  opts = opts || {};
  const rows = lines.map((l) => `<tr><td style="${td}">${esc(l.name.replace(/^Antonius Caviar /, ''))}${l.made_to_order ? ` <span style="color:#8a6a2a">· ${L.mto}</span>` : ''}</td><td align="center" style="${td};padding:9px 8px">${esc(l.qty)}</td><td align="right" style="${td};white-space:nowrap">${money(l.unit_cents * l.qty)}</td></tr>`).join('');
  const totals = opts.noTotals ? '' :
    `<tr><td colspan="2" style="${td}">${L.delivery}</td><td align="right" style="${td}">${L.free}</td></tr>`
    + `<tr><td colspan="2" style="${td}">${L.subtotal}</td><td align="right" style="${td};white-space:nowrap">${money(o.subtotal_cents)}</td></tr>`
    + `<tr><td colspan="2" style="${td}">${L.vat}</td><td align="right" style="${td};white-space:nowrap">${money(o.vat_cents)}</td></tr>`
    + `<tr><td colspan="2" style="padding:11px 0"><strong>${L.total}</strong></td><td align="right" style="padding:11px 0;white-space:nowrap"><strong>${money(o.total_cents)}</strong></td></tr>`;
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:15px"><tr><th align="left" style="${th}">${L.item}</th><th align="center" style="${th};width:60px">${L.qty}</th><th align="right" style="${th};width:100px">${L.amount}</th></tr>${rows}${totals}</table>`;
}
const outro = (L) => `${h2('&nbsp;')}<p style="margin:0 0 12px">${L.storage}</p><p style="margin:0 0 18px">${L.questions}</p><p style="margin:0">${L.bye}<br>${L.team}</p>`;
const isDecember = () => new Date().getUTCMonth() === 11;

function orderConfirmation(o, lines, c, d) {
  const L = t(o.lang);
  const mto = lines.some((l) => l.made_to_order);
  let plan = o.delivery === 'pickup' ? L.planPickupNow : L.planDpdNow;
  if (mto) plan = (o.split ? L.planSplit : L.planTogether) + ' ' + (o.delivery === 'pickup' ? L.planPickupNow : L.planDpdNow) + (isDecember() ? ' ' + L.december : '');
  const addr = o.delivery === 'pickup' ? (o.lang === 'lt' ? DIRVA_LT : DIRVA) : [o.ship_name, o.ship_street, [o.ship_postal_code, o.ship_city].filter(Boolean).join(' ')].filter(Boolean).map(esc).join('<br>');
  return {
    subject: L.orderSubject(o.ref),
    html: shell(`<h1 style="margin:0 0 14px;font-size:24px">${L.orderH}</h1>
<p style="margin:0 0 18px">${L.hello(esc(first(c.contact_name)))}<br>${L.orderIntro(esc(o.ref))}</p>
${lineTable(o, lines, L)}
${h2(L.delivery)}<p style="margin:0 0 10px">${plan}</p>
${o.delivery === 'pickup' ? button(MAP, L.map) : ''}
${d && d.parcel ? `<p style="margin:8px 0 6px">${L.parcel} – <strong>${esc(d.parcel)}</strong></p>${button(DPD.trackingUrl(d.parcel), L.track)}` : ''}
${h2(L.hDetails)}<p style="margin:0">${esc(c.company)}<br>${addr}${o.po_ref ? `<br>${L.po}: ${esc(o.po_ref)}` : ''}${o.note ? `<br>${L.note}: ${esc(o.note)}` : ''}</p>
${outro(L)}`),
  };
}

function internalOrder(o, lines, c, d) {
  const mto = lines.filter((l) => l.made_to_order);
  const now = lines.filter((l) => l.shipment_no === 1 && !l.made_to_order);
  let banner;
  if (o.delivery === 'pickup') banner = box('#f6e7b0', `<strong>Afhentning i Dirva.</strong> Bring ordren til Dirva på køl, mærket med ${esc(o.ref)} og ${esc(c.company)}, og tryk "Klar til afhentning" i admin, så kunden får besked.`);
  else if (d && d.error) banner = box('#f3c9bf', `<strong>DPD-forsendelsen kunne ikke oprettes automatisk.</strong> Tryk "Send" på ordren i admin, eller opret den i DPD-portalen. Fejl: ${esc(d.error)}`);
  else if (d && d.parcel) banner = box('#dff0e4', `<strong>DPD-forsendelse oprettet: ${esc(d.parcel)}.</strong> Labelen er vedhæftet. ${d.pickup === 'booked' ? `Afhentning bestilt ${esc(d.plan.date)} kl. ${esc(d.plan.from)}–${esc(d.plan.to)}.` : d.pickup === 'existing' ? `Kører med dagens afhentning ${esc(d.plan.date)}.` : 'Afhentning ikke bestilt (testtilstand).'} Kunden har fået sporingslink.`);
  else banner = box('#f6e7b0', `<strong>Send ordren.</strong> Tryk "Send" på ordren i admin, når den er pakket; så oprettes DPD-forsendelsen, og kunden får sporingslink.`);
  const waiting = mto.length ? box('#f6e7b0', `<strong>Bestillingsvarer:</strong> ${mto.map((l) => `${esc(l.name.replace(/^Antonius Caviar /, ''))} × ${l.qty}`).join(', ')}. Bestil hos Antonius og bekræft datoen over for kunden. ${o.split ? 'Kunden har valgt dellevering: lagervarerne sendes nu.' : 'Kunden vil have alt samlet: intet sendes, før bestillingsvarerne er her.'}`) : '';
  return {
    subject: `Ny B2B-ordre ${o.ref}: ${c.company}${o.delivery === 'pickup' ? ' (afhentning i Dirva)' : ''}${mto.length ? ' – indeholder bestillingsvarer' : ''}`,
    html: shell(`<h1 style="margin:0 0 14px;font-size:24px">Ny B2B-ordre ${esc(o.ref)}</h1>
${banner}${waiting}
${lineTable(o, lines, T.en)}
<h2 style="margin:24px 0 6px;font-size:17px">Kunde${o.lang === 'lt' ? ' (bestilte på litauisk)' : ''}</h2>
<p style="margin:0">${esc(c.company)} · virksomhedskode ${esc(c.company_code)}${c.vat_code ? ` · moms ${esc(c.vat_code)}` : ''}<br>${esc(c.contact_name)} · ${esc(c.email)} · ${esc(c.phone || '')}<br>${o.delivery === 'pickup' ? 'Afhentning i Dirva' : [o.ship_street, [o.ship_postal_code, o.ship_city].join(' ')].map(esc).join(', ')}${o.po_ref ? `<br>Kundens reference: ${esc(o.po_ref)}` : ''}${o.note ? `<br><strong>Note: ${esc(o.note)}</strong>` : ''}</p>
<p style="margin:16px 0 0">Faktura: ${now.length && mto.length && o.split ? 'to fakturaer, én pr. levering' : 'én faktura, når ordren sendes'}. <a href="${SITE}/admin.html#b2b">Åbn i admin</a></p>`),
    attachments: d && d.label ? [{ filename: `DPD-label-${o.ref}.pdf`, content: d.label }] : undefined,
  };
}

function shippedMail(o, shipment, lines, c, total) {
  const L = t(o.lang);
  return {
    subject: L.shippedSubject(o.ref, total > 1 ? shipment.no : 0),
    html: shell(`<h1 style="margin:0 0 14px;font-size:24px">${L.shippedH}</h1>
<p style="margin:0 0 18px">${L.hello(esc(first(c.contact_name)))}<br>${L.shippedText}</p>
${shipment.dpd_parcel ? `<p style="margin:0 0 6px">${L.parcel} – <strong>${esc(shipment.dpd_parcel)}</strong></p>${button(DPD.trackingUrl(shipment.dpd_parcel), L.track)}` : ''}
${h2(o.ref)}${lineTable(o, lines, L, { noTotals: true })}
${outro(L)}`),
  };
}

function readyMail(o, lines, c) {
  const L = t(o.lang);
  return {
    subject: L.readySubject(o.ref),
    html: shell(`<h1 style="margin:0 0 14px;font-size:24px">${L.readyH}</h1>
<p style="margin:0 0 12px">${L.hello(esc(first(c.contact_name)))}<br>${L.readyText}</p>${button(MAP, L.map)}
${h2(o.ref)}${lineTable(o, lines, L, { noTotals: true })}
${outro(L)}`),
  };
}

function passwordMail(kind, c, link, lang) {
  const L = t(lang);
  const welcome = kind === 'welcome';
  return {
    subject: welcome ? L.welcomeSubject : L.resetSubject,
    html: shell(`<h1 style="margin:0 0 14px;font-size:24px">${welcome ? L.welcomeH : L.resetH}</h1>
<p style="margin:0 0 6px">${L.hello(esc(first(c.contact_name)))}<br>${welcome ? L.welcomeText(esc(c.company)) : L.resetText}</p>
${button(link, welcome ? L.welcomeBtn : L.resetBtn)}
<p style="margin:12px 0 18px;font-size:13px;color:#4c5a52">${L.linkNote}</p>
<p style="margin:0">${L.bye}<br>${L.team}</p>`),
  };
}

function applicationMails(a) {
  const L = t(a.lang);
  return {
    ack: { subject: L.appSubject, html: shell(`<h1 style="margin:0 0 14px;font-size:24px">${L.appH}</h1><p style="margin:0 0 18px">${L.hello(esc(first(a.contact_name)))}<br>${L.appText(esc(a.company))}</p><p style="margin:0">${L.bye}<br>${L.team}</p>`) },
    internal: { to: [NOTIFY_TO], reply_to: a.email, subject: `Ny B2B-ansøgning: ${a.company}`, html: shell(`<h1 style="margin:0 0 14px;font-size:24px">Ny ansøgning om B2B-konto</h1>
<p style="margin:0 0 14px">${esc(a.company)} · virksomhedskode ${esc(a.company_code)}${a.vat_code ? ` · moms ${esc(a.vat_code)}` : ''}<br>${esc(a.contact_name)} · ${esc(a.email)} · ${esc(a.phone || '')}<br>${esc(a.address || '')}${a.message ? `<br><br>Besked: ${esc(a.message)}` : ''}</p>
<p style="margin:0">Godkend eller afvis under "Ansøgninger" i admin: <a href="${SITE}/admin.html#applications">${SITE}/admin.html</a>. Ved godkendelse får kunden automatisk en mail til at vælge adgangskode.</p>`) },
  };
}

module.exports = { orderConfirmation, internalOrder, shippedMail, readyMail, passwordMail, applicationMails };
