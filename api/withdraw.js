// Online withdrawal form (spoon and tin opener). Sends the statement to us and an
// acknowledgement with date and time to the customer, as consumer law requires.
const guard = require('./_guard.js');
const FROM = process.env.ORDER_FROM || 'Farmers & Company <hello@farmersandcompany.lt>';
const TO = process.env.ORDER_NOTIFY_TO || 'sp@farmersandcompany.lt';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const clip = (s, n) => String(s || '').trim().slice(0, n);

async function send(key, mail) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(Object.assign({ from: FROM, tags: [{ name: 'project', value: 'caviar-shop' }] }, mail)),
  });
  if (!r.ok) throw new Error('mail ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  const key = process.env.RESEND_API_KEY;
  if (!key) return res.status(503).json({ error: 'not_configured' });
  const b = req.body || {};
  if (b.website) return res.status(200).json({ ok: true }); // bots fill the hidden field
  if (await guard.over(req, 'withdraw', { limit: 3, windowSec: 3600 })) return res.status(429).json({ error: 'too_many' });
  const f = { name: clip(b.name, 100), email: clip(b.email, 200), ref: clip(b.ref, 40), items: clip(b.items, 500) };
  if (!f.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email) || !f.ref || !f.items) return res.status(400).json({ error: 'invalid' });

  const lt = b.lang === 'lt';
  const when = new Intl.DateTimeFormat(lt ? 'lt-LT' : 'en-GB', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Europe/Vilnius' }).format(new Date()) + (lt ? ' (Vilniaus laiku)' : ' (Vilnius time)');
  const W = lt
    ? { name: 'Vardas, pavardė', email: 'El. paštas', ref: 'Užsakymo numeris', items: 'Prekės', at: 'Pateikta',
        subject: `Gavome jūsų sutarties atsisakymą – užsakymas ${f.ref}`, h: 'Gavome jūsų sutarties atsisakymą',
        body: `Sveiki, ${esc(f.name)}, patvirtiname, kad atsisakėte toliau nurodyto pirkimo. Grąžinimo adresą atsiųsime el. paštu. Prekę grąžinkite nenaudotą, originalioje pakuotėje, per 14 dienų. Pinigus grąžinsime per 14 dienų nuo šios dienos; galime palaukti, kol prekę atgausime arba kol pateiksite įrodymą, kad ją išsiuntėte.`,
        q: 'Turite klausimų? Atsakykite į šį laišką arba rašykite' }
    : { name: 'Name', email: 'Email', ref: 'Order reference', items: 'Items', at: 'Submitted',
        subject: `We have received your withdrawal – order ${f.ref}`, h: 'We have received your withdrawal',
        body: `Hello ${esc(f.name)}, this confirms that you have withdrawn from the purchase below. We will email you the return address. Please send the item back unused, in its original packaging, within 14 days. We refund you within 14 days of today, and may wait until we have received the item or you have shown that you sent it.`,
        q: 'Questions? Reply to this email or write to' };
  const row = (w) => `<p><strong>${w.name}:</strong> ${esc(f.name)}<br><strong>${w.email}:</strong> ${esc(f.email)}<br><strong>${w.ref}:</strong> ${esc(f.ref)}<br><strong>${w.items}:</strong> ${esc(f.items)}<br><strong>${w.at}:</strong> ${esc(when)}</p>`;
  const rows = row(W);
  const wrap = (inner) => `<div style="font-family:Arial,Helvetica,sans-serif;color:#0e2219;font-size:15px;line-height:1.55;max-width:560px">${inner}</div>`;
  try {
    await send(key, { to: [TO], reply_to: f.email, subject: `Fortrydelse: ordre ${f.ref}`,
      html: wrap(`<h2 style="margin:0 0 12px">Kunden har fortrudt et køb${lt ? ' (skrev på litauisk)' : ''}</h2><p>Send kunden returadressen, og refundér senest 14 dage efter i dag (du må vente, til varen er modtaget eller afsendt).</p>${rows}`) });
    await send(key, { to: [f.email], reply_to: TO, subject: W.subject,
      html: wrap(`<h2 style="margin:0 0 12px">${W.h}</h2><p>${W.body}</p>${rows}<p>${W.q} <a href="mailto:${TO}" style="color:#0e2219">${TO}</a>.</p><p>Farmers &amp; Company</p>`) });
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('withdraw mail failed', e.message);
    return res.status(502).json({ error: 'mail' });
  }
};
