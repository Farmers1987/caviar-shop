// Newsletter sign-up from the shop popup. Passes the email to the MailerLite form
// "Caviar shop popup (caviar.farmersandcompany.lt)", which adds it to the group "Caviar B2C".
// MailerLite sends a confirmation mail first (double opt-in), so nobody is added without confirming.
const guard = require('./_guard.js');
const ACCOUNT = process.env.MAILERLITE_ACCOUNT || '1613919';
const FORM = process.env.MAILERLITE_FORM || '204643796586071132';

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); return res.status(405).json({ error: 'method' }); }
  let b = req.body;
  if (typeof b === 'string') { try { b = JSON.parse(b); } catch (e) { b = {}; } }
  b = b || {};
  if (b.website) return res.status(200).json({ ok: true }); // hidden field: bots fill it in
  const email = String(b.email || '').trim().slice(0, 200);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return res.status(400).json({ error: 'invalid_email' });
  if (await guard.over(req, 'subscribe', { limit: 5, windowSec: 3600 })) return res.status(429).json({ error: 'too_many' });
  try {
    const body = new URLSearchParams({ 'fields[email]': email, 'ml-submit': '1', anticsrf: 'true' });
    const r = await fetch(`https://assets.mailerlite.com/jsonp/${ACCOUNT}/forms/${FORM}/subscribe`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: body.toString(),
    });
    const text = await r.text();
    let d = {}; try { d = JSON.parse(text); } catch (e) {}
    if (!r.ok || d.success === false) { console.error('mailerlite subscribe', r.status, text.slice(0, 300)); return res.status(502).json({ error: 'failed' }); }
    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('mailerlite subscribe failed', e.message);
    return res.status(502).json({ error: 'failed' });
  }
};
