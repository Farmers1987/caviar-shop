// Shared mail helpers (Resend) for the B2B mails. Same look as the shop's order mails.
const LOGO = require('./_logo.js');

const SITE = (process.env.SITE_URL || 'https://caviar-shop.vercel.app').replace(/\/$/, '');
const FROM = process.env.ORDER_FROM || 'Farmers & Company <hello@farmersandcompany.lt>';
const REPLY_TO = process.env.ORDER_REPLY_TO || 'sp@farmersandcompany.lt';
const NOTIFY_TO = process.env.ORDER_NOTIFY_TO || 'sp@farmersandcompany.lt';

const esc = (v) => String(v == null ? '' : v).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const money = (cents) => {
  const [i, d] = (Math.round(cents) / 100).toFixed(2).split('.');
  return i.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ',' + d + ' €';
};

const shell = (inner) => `<!doctype html><html><body style="margin:0;background:#f1eee4;font-family:Arial,Helvetica,sans-serif;color:#0e2219">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff">
<tr><td align="center" style="background:#0e2219;color:#f1eee4;padding:18px 28px;font-size:18px;letter-spacing:2px"><img src="cid:fc-logo" width="160" height="104" alt="FARMERS &amp; COMPANY" style="display:block;border:0;width:160px;height:auto;color:#f1eee4"></td></tr>
<tr><td style="padding:28px;font-size:15px;line-height:1.55">${inner}</td></tr>
</table></td></tr></table></body></html>`;

const button = (href, text) => `<p style="margin:14px 0 6px"><a href="${esc(href)}" style="display:inline-block;background:#0e2219;color:#f1eee4;text-decoration:none;padding:12px 22px;font-size:14px;font-weight:bold">${esc(text)}</a></p>`;
const h2 = (x) => `<h2 style="margin:26px 0 6px;font-size:17px">${x}</h2>`;
const box = (bg, html) => `<p style="margin:0 0 18px;padding:12px 14px;background:${bg}">${html}</p>`;

async function send(idempotencyKey, mail) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error('RESEND_API_KEY missing');
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(Object.assign({ from: FROM, reply_to: REPLY_TO, tags: [{ name: 'project', value: 'caviar-shop' }] }, mail, {
      attachments: [{ filename: 'farmers-company.png', content: LOGO, content_id: 'fc-logo' }].concat(mail.attachments || []),
    })),
  });
  if (!r.ok) throw new Error('mail ' + r.status + ' ' + (await r.text()).slice(0, 200));
}

module.exports = { SITE, FROM, REPLY_TO, NOTIFY_TO, esc, money, shell, button, h2, box, send };
